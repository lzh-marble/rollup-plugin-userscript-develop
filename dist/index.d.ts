import type { Plugin } from "rollup";
/**
 * 通过插入"require"指令引用存放在文件系统的脚本
 * 避免开发时需要重复去复制粘贴脚本到油猴编辑区
 * @param {object} options
 * @param {string} options.name 输出文件名
 * @param {boolean} options.extractToExternal 将userscript的meta注释抽离到另一个脚本文件，并在该脚本添加@require指令 指向原脚本文件
 * @returns
 */
type PluginOptions = {
    name?: string;
    extractToExternal?: boolean;
};
export default function (options: PluginOptions): Plugin;
export {};
