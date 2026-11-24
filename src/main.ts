import "./style.css";

const status = document.querySelector<HTMLParagraphElement>("#app-status");
if (!status) {
  throw new Error("启动失败：缺少应用状态元素");
}

status.textContent = "应用已启动";
