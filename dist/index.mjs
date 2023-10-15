import path from 'node:path';
import MagicString from 'magic-string';
import { full } from 'acorn-walk';

/**
 * 通过插入"require"指令引用存放在文件系统的脚本
 * 避免开发时需要重复去复制粘贴脚本到油猴编辑区
 * @param {object} options
 * @param {string} options.name 输出调试脚本文件名
 * @param {boolean} options.extractToExternal 将userscript的header抽离到另一个脚本文件，并在该脚本添加@require指令 指向原脚本文件
 * @returns
 */

function index (options = {}) {
  let userscriptHeaders = [];
  return {
    name: "rollup-plugin-userscript-responsive-develop",
    transform(code) {
      let ms = new MagicString(code);
      let isUserscriptHeaders = false;
      const ast = this.parse(code, {
        onComment: (isBlock, text, start, end) => {
          if (!isBlock) {
            if (text.includes("==UserScript==")) {
              isUserscriptHeaders = true;
              ms.remove(start, end);
              return;
            }
            if (text.includes("==/UserScript==")) {
              isUserscriptHeaders = false;
              ms.remove(start, end);
              return;
            }
            if (isUserscriptHeaders) {
              userscriptHeaders.push(text.trim());
              ms.remove(start, end);
            }
          }
        }
      });
      full(ast, node => {
        ms.addSourcemapLocation(node.start);
        ms.addSourcemapLocation(node.end);
      });
      return {
        code: ms.toString(),
        map: ms.generateMap({
          includeContent: true
        })
      };
    },
    generateBundle(outputOpts, bundle) {
      Object.values(bundle).forEach(file => {
        if (file.type === "chunk") {
          if (options?.extractToExternal) {
            const spaceLength = userscriptHeaders.reduce((result, comment) => {
              const prefixLength = comment.match(/@\w+\s+/)?.length ?? 0 - "@require".length;
              return Math.max(prefixLength, result);
            }, 1);
            userscriptHeaders = [...userscriptHeaders, `@require${" ".repeat(spaceLength)}file://${path.resolve(process.cwd(), outputOpts.file)}`];
          }
          if (!userscriptHeaders.length) return;
          userscriptHeaders = ["==UserScript==", ...userscriptHeaders, "==/UserScript=="];
          const userscriptHeadersStr = userscriptHeaders.map(c => `// ${c}\n`).join("");
          if (options?.extractToExternal) {
            // 中间空格的长度，取所有userscript header中空格数最多的
            this.emitFile({
              type: "asset",
              fileName: options?.name ?? `debug.${outputOpts.file}$`,
              source: userscriptHeadersStr
            });
          } else {
            file.code = `${userscriptHeadersStr}\n${file.code}`;
            if (file?.map?.mappings) {
              // 因为是给生成代码的顶部添加userscript header，所以mapping也要加上相同行数的空行使映射正确
              file.map.mappings = `${";".repeat(userscriptHeaders.length)}${file.map.mappings}`;
            }
          }
        }
      });
    }
  };
}

export { index as default };
