import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as types from "@babel/types";
import { OutputPlugin, OutputChunk } from "rollup";

/**
 * 从源码中把userscript的meta注释抽离出来
 * @param {string} code
 * @param {string} scriptOutputPath
 * @returns {object}
 */
function splitMetaData(sourceFile: OutputChunk, scriptOutputPath?: string) {
  const ast = parse(sourceFile.code);

  const filterOfStart = (v) =>
    v.type == "CommentLine" && v.value.includes("==UserScript==");
  const filterOfEnd = (v) =>
    v.type == "CommentLine" && v.value.includes("==/UserScript==");

  // 从注释中提取出userscript的meta
  function extractMetaFromComments(comments) {
    if (!comments) {
      return;
    }

    const startNodeIndex = comments.findIndex(filterOfStart);
    const endNodeIndex = comments.findIndex(filterOfEnd);
    if (startNodeIndex == -1 || endNodeIndex == -1) {
      return;
    }
    const metaCommentArr = comments.splice(
      startNodeIndex,
      endNodeIndex - startNodeIndex + 1
    );
    return metaCommentArr;
  }

  // 生成内容为userscript的meta的ast
  // ⚠️：会修改源码ast
  function generateMetaAst(metaCommentArr) {
    const emptyNode = types.program([], [], "script");
    types.addComments(emptyNode, "inner", metaCommentArr);

    if (scriptOutputPath) {
      // inject require statement of real script
      const requireCommentValue = ` @require file://${scriptOutputPath}`;
      types.addComment(emptyNode, "inner", requireCommentValue, true);

      // adjust require statment order in comment array
      const requireCommentIndex = emptyNode.innerComments.findIndex(
        (comment) =>
          comment.type == "CommentLine" && comment.value === requireCommentValue
      );
      const requireComment = emptyNode.innerComments.splice(
        requireCommentIndex,
        1
      )[0];
      emptyNode.innerComments.splice(
        emptyNode.innerComments.findIndex(filterOfEnd),
        0,
        requireComment
      );
    }

    return generate(emptyNode);
  }

  // 遍历源码ast查找包含userscript的meta的评论
  function findCommentsContainMeta(ast) {
    let result;
    let hasMetaComments: boolean = false;

    traverse(ast, {
      Program(path) {
        if (hasMetaComments) return;
        const metaCommentArr = extractMetaFromComments(
          path.node.body?.[0]?.leadingComments
        );
        if (!metaCommentArr) return;
        hasMetaComments = true;
        result = metaCommentArr;
      },
      ExpressionStatement(path) {
        if (hasMetaComments) return;
        const metaCommentArr =
          extractMetaFromComments(path.node?.leadingComments) ||
          extractMetaFromComments(path.node?.trailingComments);
        if (!metaCommentArr) return;
        hasMetaComments = true;
        result = metaCommentArr;
      },
      BlockStatement(path) {
        if (hasMetaComments) return;
        const metaCommentArr = extractMetaFromComments(
          path.node?.innerComments
        );
        if (!metaCommentArr) return;
        hasMetaComments = true;
        result = metaCommentArr;
      },
    });
    return result;
  }

  const metaComments = findCommentsContainMeta(ast);
  const metaGenerateResult = generateMetaAst(metaComments);
  const scriptGenerateResult = generate(ast, {
    sourceMaps: true,
    inputSourceMap: sourceFile.map,
  });

  return {
    meta: metaGenerateResult,
    script: scriptGenerateResult,
  };
}

/**
 * 将多个ast重新组装到一起
 * @param {object[]} generateResult 调用@babel/generate的generate方法生成的产物
 */
function combineGenerateResult(sourceFile: OutputChunk, ...generateResult) {
  const existingGenerateResult = generateResult
    .map((rs) => rs?.code)
    .filter(Boolean);
  if (existingGenerateResult.length > 1) {
    const code = existingGenerateResult.join("\n");
    return generate(
      parse(code),
      {
        sourceMaps: true,
        inputSourceMap: sourceFile.map,
      },
      code
    );
  } else if (existingGenerateResult.length == 1) {
    return existingGenerateResult[0];
  }
  return;
}

/**
 * 将babel产出的sourceMap的部分字段填充回rollup的sourceMap中
 * @param {object} originalMap 原sourcemap
 * @param {object} newMap 插件转换后的sourcemap
 * @param {string} newCode 
 * @returns 
 */
function adaptSourceMap(originalMap, newMap, newCode) {
  if (!newMap) {
    return originalMap;
  }
  return Object.assign(originalMap, {
    names: newMap.names,
    mappings: newMap.mappings,
    sourcesContent: newMap.sourcesContent
  });
}


/**
 * 补全代码末的换行符。
 * generate会把源码末尾的换行符去掉，
 * 原因待排查，暂时用该方法手动加回去。
 * @param {string} originalCode 插件处理前的代码
 * @param {string} newCode  插件处理后的代码
 * @returns 
 */
function completeEndLineBreak(originalCode, newCode) {
  if (!originalCode || !newCode) {
    return originalCode;
  }
  if (originalCode.endsWith("\n") && !newCode.endsWith("\n")) {
    originalCode = `${newCode}\n`;
  } else {
    originalCode = newCode;
  }
  return originalCode;
}

/**
 * 将脚本输出到另一个文件
 * 然后原输出文件只留下userscript的metadata，同时插入"require"指令指向上述文件的文件路径
 * 实现开发时的脚本逻辑实时同步
 *
 * @param {object} options
 * @param {string} options.name 输出文件名
 * @param {boolean} options.extractToHeader 将userscript的meta注释提取到文件顶部而不是抽离到另一个文件夹
 * @returns
 */
type PluginOptions = {
  name?: string;
  extractToHeader?: boolean;
};

export default function (options: PluginOptions): OutputPlugin {
  const workspace = process.cwd();
  return {
    name: "rollup-plugin-userscript-develop",
    generateBundle(outputOpts, bundle) {
      Object.values(bundle).forEach((file) => {
        if (file.type === "chunk") {
          const { meta, script } = splitMetaData(
            file,
            path.resolve(workspace, outputOpts.file)
          );
          if (options?.extractToHeader) {
            const combineResult = combineGenerateResult(file, meta, script);
            file.code = completeEndLineBreak(file.code, combineResult?.code);
            file.map = adaptSourceMap(file.map, combineResult.map, combineResult.code)
          } else {
            if (meta?.code) {
              this.emitFile({
                type: "asset",
                fileName: options?.name ?? `debug.${outputOpts.file}$`,
                source: meta.code,
              });
              file.code = completeEndLineBreak(file.code, script?.code);
              file.map = adaptSourceMap(file.map, script.map, script.code)
            }
          }
        }
      });
    },
  };
}
