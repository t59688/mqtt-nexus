# NexusMQTT：一个多连接 MQTT 客户端的自留地

---

MQTT 不是什么新东西。协议老、场景偏、多数人一辈子不会碰。它活在边缘：传感器、工控、物联网、那些沉默发着数据的盒子。你接上一台 broker，订阅几个 topic，消息就像雪片一样落下来，没人看见，也没人在意。可总有人得接住这些雪片，得有一扇窗能同时望见好几条线、好几台 broker，而不是在终端里敲命令，或依赖某个闭源、绑云、越更越重的商业客户端。

所以我做了 **NexusMQTT**。与其说是“产品”，不如说是一块自留地：给自己用，也给同样需要这点确定性的人用。

---

## 它是什么

- **多连接**：一个窗口里管多个 broker，不用来回切软件、切配置。像在同一个屋檐下点好几盏灯，各自亮着，互不踩脚。
- **实时消息**：订阅、发布、看流量，都是活的。没有“刷新”的幻觉，数据到了就更新。
- **Rust 后端**：MQTT 和 WebSocket 用 [rumqttc](https://github.com/bytebeamio/rumqttc) 做，逻辑全在 Rust 里，稳、省资源，桌面端不拖泥带水。
- **AI 载荷生成**：可选。用兼容 OpenAI 的 API（[rig-core](https://github.com/rig-rs/rig)）生成要发布的内容，适合调试、造测试数据。不用也可以，核心不依赖它。
- **桌面 + Web**：Tauri 2 打包成桌面应用，也能只跑 Web 前端。Linux 上一样用。
- **中英界面**：i18n 做了，英文和中文都有。

技术栈一句话：**React 19 + Vite + TypeScript** 做界面，**Tauri 2** 做壳，**Rust** 里放着 rumqttc、rig-core、rusqlite、tokio。前后端通过 Tauri 的 invoke 和事件通信，结构简单，没有为了“炫技”堆出来的层。

---

## 为什么开源

做这个东西，是因为我自己需要：多 broker、多连接、本地优先、不依赖云、不想要又大又慢的 Electron。做完之后发现，这种需求不会只有我一个人有。那些在机房、在实验室、在自家阁楼里接设备的人，可能也在找同一类东西——轻、可控、能一直用下去。

开源，是给这段需求留一条可追溯的痕迹。代码在，别人能改、能 fork、能拿去适配自己的环境；就算某一天我不再维护，至少还有一份可编译、可运行的底稿。万物皆会消逝，但至少可以少一点“用过即弃”的虚无。

---

## 怎么用

**环境**：Node.js 18+、npm；桌面版需要 Rust 和 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/your-org/mqtt-nexus.git
cd mqtt-nexus
npm install
```

- 只跑 Web 前端：`npm run dev`
- 跑桌面应用：`npm run tauri dev`
- 打桌面安装包：`npm run tauri build`，产物在 `src-tauri/target/release/` 及对应 bundle。

AI 相关（可选）：通过环境变量 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`（或 `AI_*` 系列）配置兼容 OpenAI 的 API 即可。

---

## 许可证与仓库

MIT。仓库地址请在应用内「关于」或项目 README 中查看（当前示例为占位路径，请替换为实际仓库 URL）。

---

如果你也在用 MQTT，也在找一款多连接、本地、不臃肿的客户端，不妨试一下。不求被多少人看见，只希望它能在某几台机器、某几条连接上，稳稳地亮着。

---

*NexusMQTT — 多连接 MQTT 客户端，Tauri 2 + React + Rust。*
