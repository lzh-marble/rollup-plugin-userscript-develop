import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as types from "@babel/types";
import type { Plugin } from "rollup";

// TODO: 开启terser后，sourcemap映射异常

/**
 * 从源码中把userscript的meta注释抽离出来
 * @param {string} code 源码
 * @returns {object}
 */
function splitMetaCommentsFromCode(code: string) {
  const ast = parse(code, {
    sourceType: "unambiguous",
  });

  const filterOfStart = (v) =>
    v.type == "CommentLine" && v.value.includes("==UserScript==");
  const filterOfEnd = (v) =>
    v.type == "CommentLine" && v.value.includes("==/UserScript==");

  // 遍历源码ast查找包含userscript的meta的注释
  function findCommentsContainMeta(ast) {
    let result = [];

    // 抽离出带有meta的注释
    function exarctComments(comments) {
      if (!comments) {
        return;
      }
      while (comments.length) {
        const startNodeIndex = comments.findIndex(filterOfStart);
        const endNodeIndex = comments.findIndex(filterOfEnd);

        if (startNodeIndex == -1 || endNodeIndex == -1) {
          break;
        }
        let newComments = comments.splice(
          startNodeIndex,
          endNodeIndex - startNodeIndex + 1
        );
        newComments.shift();
        newComments.pop();
        result = result.concat(newComments);
      }
    }

    traverse(ast, {
      enter(path) {
        exarctComments(path.node.leadingComments);
        exarctComments(path.node.trailingComments);
      },
    });
    return result;
  }

  return {
    metaCommentArr: findCommentsContainMeta(ast),
    script: generate(ast),
  };
}

/**
 * 将babel产出的sourceMap的部分字段填充回rollup的sourceMap中
 * @param {object} originalMap 原sourcemap
 * @param {object} newMap 插件转换后的sourcemap
 * @param {string} newCode
 * @returns
 */
function adaptSourceMap(originalMap, newMap) {
  if (!newMap) {
    return originalMap;
  }
  return Object.assign(originalMap, {
    names: newMap.names,
    mappings: newMap.mappings,
    sourcesContent: newMap.sourcesContent,
  });
}

/**
 * 生成一个只有传入comments的ast
 * @param metaCommentArr
 * @returns
 */
function generateMetaCommentAst(metaCommentArr) {
  const emptyNode = types.program([], [], "script");

  types.addComment(emptyNode, "inner", "==UserScript==", true);
  metaCommentArr?.length &&
    types.addComments(emptyNode, "inner", metaCommentArr);
  types.addComment(emptyNode, "inner", "==/UserScript==", true);
  return emptyNode;
}

/**
 * 将导入语句添加到ast中
 * @param metaCommentAst 包含
 * @param {string} scriptOutputPath 开发用的脚本输出的文件路径
 * @param {boolean} shouldAppendRequireComment 是否插入导入上述开发脚本的注释
 * @returns
 */
function addDevScriptRequireStatementToMetaCommentAst(
  metaCommentAst,
  scriptOutputPath
) {
  if (scriptOutputPath) {
    if (!metaCommentAst) {
      metaCommentAst = types.program([], [], "script");

      types.addComment(metaCommentAst, "inner", " ==UserScript==", true);
      types.addComment(metaCommentAst, "inner", " ==/UserScript==", true);
    }

    const requireCommentValue = ` @require file://${scriptOutputPath}`;

    types.addComment(metaCommentAst, "inner", requireCommentValue, true);

    const requireComment = metaCommentAst.innerComments.splice(
      metaCommentAst.innerComments.length - 1,
      1
    )[0];

    metaCommentAst.innerComments.splice(
      metaCommentAst.innerComments.length - 1,
      0,
      requireComment
    );

    return metaCommentAst;
  }
}

/**
 * 通过插入"require"指令引用存放在文件系统的脚本
 * 避免开发时需要重复去复制粘贴脚本到油猴编辑区
 * @param {object} options
 * @param {string} options.name 输出文件名
 * @param {boolean} options.extractToHeader 将userscript的meta注释提取到文件顶部而不是抽离到另一个文件
 * @returns
 */
type PluginOptions = {
  name?: string;
  extractToHeader?: boolean;
};

export default function (options: PluginOptions): Plugin {
  let metaCommentArr = [];

  return {
    name: "rollup-plugin-userscript-responsive-develop",
    transform(code) {
      let { metaCommentArr: newMetaComments, script } =
        splitMetaCommentsFromCode(code);
      metaCommentArr = [...metaCommentArr, ...newMetaComments];
      return {
        code: script.code,
        map: script.map,
      };
    },
    generateBundle(outputOpts, bundle) {
      Object.values(bundle).forEach((file) => {
        if (file.type === "chunk") {
          if (options?.extractToHeader) {
            if (metaCommentArr.length) {
              const metaCommentsAst = generateMetaCommentAst(metaCommentArr);

              metaCommentsAst.body.push(...parse(file.code).program.body);

              const { code: newCode, map: newMap } = generate(metaCommentsAst, {
                inputSourceMap: file.map,
                sourceMaps: true,
              });

              file.code = newCode;
              file.map = adaptSourceMap(file.map, newMap);
            }
          } else {
            const metaCommentsAst =
              addDevScriptRequireStatementToMetaCommentAst(
                generateMetaCommentAst(metaCommentArr),
                path.resolve(process.cwd(), outputOpts.file)
              );
            this.emitFile({
              type: "asset",
              fileName: options?.name ?? `debug.${outputOpts.file}$`,
              source: generate(metaCommentsAst).code,
            });
          }
        }
      });
    },
  };
}
