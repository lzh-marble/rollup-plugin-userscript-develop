import path from "path";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "@rollup/plugin-terser";
import { babel } from "@rollup/plugin-babel";
import replace from "@rollup/plugin-replace";
import pkg from "./package.json";

const isProduction = process.env.NODE_ENV == "prod";

export default {
  input: path.resolve(__dirname, "src/index.ts"),
  output: [
    {
      file: pkg.main,
      format: "cjs",
      exports: 'default'
    },
    {
      file: pkg.module,
      format: "es",
      exports: 'default'
    },
  ],
  external: [
    /@babel/
  ],
  plugins: [
    resolve({
      browser: false,
      extensions: [".ts", ".js"],
    }),
    commonjs(),
    replace({
      "process.env.NODE_ENV": process.env.NODE_ENV,
      preventAssignment: true,
    }),
    babel({
      include: ["src/**/*"],
      extensions: [".js", ".ts"],
      babelHelpers: "bundled",
    }),
    isProduction && terser(),
  ],
};
