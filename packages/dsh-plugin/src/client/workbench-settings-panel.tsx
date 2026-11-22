import { useEffect, useId, useRef } from "react";
import { workbenchLabel, type WorkbenchMode } from "./file-activity.js";
import { visibleWorkbenchModes, WORKBENCH_MODES } from "./workbench-settings.js";

export function WorkbenchSettingsButton({ onClick }: { readonly onClick: () => void }) {
  return <button className="oh-workbench-settings-toggle" type="button" aria-label="工作台设置" aria-haspopup="dialog" title="工作台设置" onClick={onClick}>⚙</button>;
}

interface SettingsProps {
  readonly modes: readonly WorkbenchMode[];
  readonly onChange: (modes: readonly WorkbenchMode[]) => void;
}

export function WorkbenchSettingsForm({ modes, onChange }: SettingsProps) {
  return <>
    <fieldset>
      <legend>显示的页卡</legend>
      <p>只保留常用的工作台。隐藏不删除项目，也不影响 Skills 或制作任务。</p>
      <div className="oh-workbench-settings-options">{WORKBENCH_MODES.map((mode) => <label key={mode}>
        <input type="checkbox" checked={modes.includes(mode)} disabled={modes.length === 1 && modes.includes(mode)} onChange={(event) => {
          onChange(visibleWorkbenchModes(event.target.checked ? [...modes, mode] : modes.filter((item) => item !== mode)));
        }} />
        <span>{workbenchLabel(mode)}</span>
      </label>)}</div>
      <p>至少保留一个页卡。选择在当前浏览器中按工作区记住。</p>
      <button type="button" onClick={() => { onChange(WORKBENCH_MODES); }}>显示全部</button>
    </fieldset>
    <section aria-label="模型与 API 配置说明">
      <h3>模型与 API</h3>
      <p>对话模型与 API 在 DSH 设置中管理。</p>
      <p>图片、视频、配音与配乐使用各制作工具的供应商配置，不会自动复用对话模型。请按短剧或视频工作台「制作详情」中的提示，在启动 DSH 的环境里配置；Agent 使用沙箱或远程环境时，需在对应执行环境配置。</p>
    </section>
  </>;
}

export function isDialogBackdropClick(
  dialog: Pick<HTMLDialogElement, "getBoundingClientRect">,
  event: { readonly target: unknown; readonly detail?: number; readonly clientX: number; readonly clientY: number }
): boolean {
  if (event.target !== dialog) return false;
  if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return false;
  const rect = dialog.getBoundingClientRect();
  const inside = rect.width > 0 && rect.height > 0
    && event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
  return !inside;
}

export function WorkbenchSettingsPanel({ modes, onChange, onClose }: SettingsProps & { readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
  }, []);
  return <dialog
    ref={dialog}
    className="oh-workbench-settings"
    aria-labelledby={titleId}
    onClose={onClose}
    onClick={(event) => {
      if (dialog.current !== null && isDialogBackdropClick(dialog.current, event)) dialog.current.close();
    }}
  >
    <div className="oh-workbench-settings-body">
      <header><h2 id={titleId}>工作台设置</h2><button type="button" aria-label="关闭工作台设置" onClick={() => { dialog.current?.close(); }}>×</button></header>
      <WorkbenchSettingsForm modes={modes} onChange={onChange} />
    </div>
  </dialog>;
}
