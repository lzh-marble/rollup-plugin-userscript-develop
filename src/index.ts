import path from "node:path";
import MagicString from "magic-string";
import { full } from "acorn-walk";
import { type Plugin } from "rollup";

/**
 * 通过插入"require"指令引用存放在文件系统的脚本
 * 避免开发时需要重复去复制粘贴脚本到油猴编辑区
 * @param {object} options
 * @param {string} options.name 输出文件名
 * @param {boolean} options.extractToExternal 将userscript的meta注释抽离到另一个脚本文件，并在该脚本添加@require指令 指向原脚本文件
 * @returns
 */
export type PluginOptions = {
  name?: string;
  extractToExternal?: boolean;
};

export default function (options: PluginOptions = {}): Plugin {
  let metaCommentArr: string[] = [];

  return {
    name: "rollup-plugin-userscript-responsive-develop",
    transform(code) {
      let ms = new MagicString(code);
      let isUserscriptMeta = false;

      const ast = this.parse(code, {
        onComment: (
          isBlock: boolean,
          text: string,
          start: number,
          end: number
        ) => {
          if (!isBlock) {
            if (text.includes("==UserScript==")) {
              isUserscriptMeta = true;
              ms.remove(start, end);
              return;
            }
            if (text.includes("==/UserScript==")) {
              isUserscriptMeta = false;
              ms.remove(start, end);
              return;
            }
            if (isUserscriptMeta) {
              metaCommentArr.push(text.trim());
              ms.remove(start, end);
            }
          }
        },
      });
      full(ast, (node) => {
        ms.addSourcemapLocation(node.start);
        ms.addSourcemapLocation(node.end);
      });

      return {
        code: ms.toString(),
        map: ms.generateMap({
          includeContent: true,
        }),
      };
    },
    generateBundle(outputOpts, bundle) {
      Object.values(bundle).forEach((file) => {
        if (file.type === "chunk") {
          if (options?.extractToExternal) {
            const spaceLength = metaCommentArr.reduce((result, comment) => {
              const prefixLength =
                comment.match(/@\w+\s+/).length - "@require".length;

              return (result = Math.max(prefixLength, result));
            }, 1);
            metaCommentArr = [
              ...metaCommentArr,
              `@require${" ".repeat(spaceLength)}file://${path.resolve(
                process.cwd(),
                outputOpts.file
              )}`,
            ];
          }

          if (!metaCommentArr.length) return;

          metaCommentArr = [
            "==UserScript==",
            ...metaCommentArr,
            "==/UserScript==",
          ];

          const metaCodeStr = metaCommentArr.map((c) => `// ${c}\n`).join("");

          if (options?.extractToExternal) {
            // 中间空格的长度，取所有meta中空格数最多的
            this.emitFile({
              type: "asset",
              fileName: options?.name ?? `debug.${outputOpts.file}$`,
              source: metaCodeStr,
            });
          } else {
            file.code = `${metaCodeStr}\n${file.code}`;
            // 因为是给生成代码的顶部添加meta注释，所以mapping也要加上相同行数的空行使映射正确
            file.map.mappings = `${";".repeat(metaCommentArr.length)}${
              file.map.mappings
            }`;
          }
        }
      });
    },
  };
}
