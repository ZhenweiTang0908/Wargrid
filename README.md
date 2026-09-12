# Wargrid

一个将卡牌攻防与 3D 方格战棋结合的手机横屏原型。

## 本地运行

```bash
pnpm install
pnpm dev
```

浏览器打开终端显示的本地地址，并将窗口调整为横屏比例。

## 验证

```bash
pnpm test
pnpm build
```

## Android 安装包

可直接安装的调试版位于 [`release/Wargrid-0.1.0-debug.apk`](release/Wargrid-0.1.0-debug.apk)。将文件传到安卓手机后打开安装；首次安装时，系统可能会要求允许文件管理器安装未知来源应用。

重新构建 APK 需要 JDK 21、Android SDK 36 和 Build Tools 35/36：

```bash
pnpm android:apk
```

应用包名为 `com.wargrid.game`，启动后固定使用横屏。调试版由 Android 默认调试证书签名，仅用于开发试玩；发布到应用商店前需生成正式签名包。

当前版本包含四人身份局、十一张 9×9 战场（含据点偏置的枫林旧寨、雪岭烽道和云岭梯田）、移动与寻路、基础牌/锦囊/装备、身份胜负和 AI 座次轮转。选将前可选择标准牌池（108 张，含 EX 牌）或扩展牌池（116 张，加入军争牌）；牌面配置参考[标准包牌表](https://wiki.biligame.com/sgs/标准包卡牌)。原创武将 3D 制作规范见 [docs/3d-art-direction.md](docs/3d-art-direction.md)。
