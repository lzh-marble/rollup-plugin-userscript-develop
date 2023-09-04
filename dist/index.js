'use strict';

var path = require('path');
var parser = require('@babel/parser');
var traverse = require('@babel/traverse');
var generate = require('@babel/generator');
var types = require('@babel/types');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var traverse__default = /*#__PURE__*/_interopDefaultLegacy(traverse);
var generate__default = /*#__PURE__*/_interopDefaultLegacy(generate);
var types__namespace = /*#__PURE__*/_interopNamespace(types);

/**
 * 从源码中把userscript的meta注释抽离出来
 * @param {string} code
 * @param {string} scriptOutputPath
 * @returns {object}
 */
function splitMetaData(sourceFile, scriptOutputPath) {
  const ast = parser.parse(sourceFile.code);
  const filterOfStart = v => v.type == "CommentLine" && v.value.includes("==UserScript==");
  const filterOfEnd = v => v.type == "CommentLine" && v.value.includes("==/UserScript==");

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
    const metaCommentArr = comments.splice(startNodeIndex, endNodeIndex - startNodeIndex + 1);
    return metaCommentArr;
  }

  // 生成内容为userscript的meta的ast
  // ⚠️：会修改源码ast
  function generateMetaAst(metaCommentArr) {
    const emptyNode = types__namespace.program([], [], "script");
    types__namespace.addComments(emptyNode, "inner", metaCommentArr);
    if (scriptOutputPath) {
      // inject require statement of real script
      const requireCommentValue = ` @require file://${scriptOutputPath}`;
      types__namespace.addComment(emptyNode, "inner", requireCommentValue, true);

      // adjust require statment order in comment array
      const requireCommentIndex = emptyNode.innerComments.findIndex(comment => comment.type == "CommentLine" && comment.value === requireCommentValue);
      const requireComment = emptyNode.innerComments.splice(requireCommentIndex, 1)[0];
      emptyNode.innerComments.splice(emptyNode.innerComments.findIndex(filterOfEnd), 0, requireComment);
    }
    return generate__default["default"](emptyNode);
  }

  // 遍历源码ast查找包含userscript的meta的评论
  function findCommentsContainMeta(ast) {
    let result;
    let hasMetaComments = false;
    traverse__default["default"](ast, {
      Program(path) {
        var _path$node$body, _path$node$body$;
        if (hasMetaComments) return;
        const metaCommentArr = extractMetaFromComments((_path$node$body = path.node.body) === null || _path$node$body === void 0 ? void 0 : (_path$node$body$ = _path$node$body[0]) === null || _path$node$body$ === void 0 ? void 0 : _path$node$body$.leadingComments);
        if (!metaCommentArr) return;
        hasMetaComments = true;
        result = metaCommentArr;
      },
      ExpressionStatement(path) {
        var _path$node, _path$node2;
        if (hasMetaComments) return;
        const metaCommentArr = extractMetaFromComments((_path$node = path.node) === null || _path$node === void 0 ? void 0 : _path$node.leadingComments) || extractMetaFromComments((_path$node2 = path.node) === null || _path$node2 === void 0 ? void 0 : _path$node2.trailingComments);
        if (!metaCommentArr) return;
        hasMetaComments = true;
        result = metaCommentArr;
      },
      BlockStatement(path) {
        var _path$node3;
        if (hasMetaComments) return;
        const metaCommentArr = extractMetaFromComments((_path$node3 = path.node) === null || _path$node3 === void 0 ? void 0 : _path$node3.innerComments);
        if (!metaCommentArr) return;
        hasMetaComments = true;
        result = metaCommentArr;
      }
    });
    return result;
  }
  const metaComments = findCommentsContainMeta(ast);
  const metaGenerateResult = generateMetaAst(metaComments);
  const scriptGenerateResult = generate__default["default"](ast, {
    sourceMaps: true,
    inputSourceMap: sourceFile.map
  });
  return {
    meta: metaGenerateResult,
    script: scriptGenerateResult
  };
}

/**
 * 将多个ast重新组装到一起
 * @param {object[]} generateResult 调用@babel/generate的generate方法生成的产物
 */
function combineGenerateResult(sourceFile, ...generateResult) {
  const existingGenerateResult = generateResult.map(rs => rs === null || rs === void 0 ? void 0 : rs.code).filter(Boolean);
  if (existingGenerateResult.length > 1) {
    const code = existingGenerateResult.join("\n");
    return generate__default["default"](parser.parse(code), {
      sourceMaps: true,
      inputSourceMap: sourceFile.map
    }, code);
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

function index (options) {
  const workspace = process.cwd();
  return {
    name: "rollup-plugin-userscript-develop",
    generateBundle(outputOpts, bundle) {
      Object.values(bundle).forEach(file => {
        if (file.type === "chunk") {
          const {
            meta,
            script
          } = splitMetaData(file, path__default["default"].resolve(workspace, outputOpts.file));
          debugger;
          if (options !== null && options !== void 0 && options.extractToHeader) {
            const combineResult = combineGenerateResult(file, meta, script);
            file.code = completeEndLineBreak(file.code, combineResult === null || combineResult === void 0 ? void 0 : combineResult.code);
            file.map = adaptSourceMap(file.map, combineResult.map, combineResult.code);
          } else {
            if (meta !== null && meta !== void 0 && meta.code) {
              var _options$name;
              this.emitFile({
                type: "asset",
                fileName: (_options$name = options === null || options === void 0 ? void 0 : options.name) !== null && _options$name !== void 0 ? _options$name : `debug.${outputOpts.file}$`,
                source: meta.code
              });
              file.code = completeEndLineBreak(file.code, script === null || script === void 0 ? void 0 : script.code);
              file.map = adaptSourceMap(file.map, script.map, script.code);
            }
          }
        }
      });
    }
  };
}

module.exports = index;
