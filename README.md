# rollup-plugin-userscript-responsive-develop

将脚本逻辑和userscript的meta分离，并在meta添加`@require`指令引入分离的脚本，达成开发`userscript`时不用重复复制粘贴脚本到拓展编辑区目的。

## require

`node >= 12.0.0`
## usage

### build

build compressed version

```js
npm run prod
```

### develop

build for debugging

```js
npm run dev
```

