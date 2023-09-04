import { OutputPlugin } from "rollup";
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
export default function (options: PluginOptions): OutputPlugin;
export {};
