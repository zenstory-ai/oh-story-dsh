import { workbenchLabel, type WorkbenchMode } from "./file-activity.js";
import { handleTabKey } from "./workbench-ui.js";

export const WORKBENCH_MODES = ["story", "drama", "game", "video"] as const satisfies readonly WorkbenchMode[];

/** The one cross-workbench navigation; each workbench only styles it through `className`. */
export function WorkbenchModeTabs({ className, current, onSelect }: {
  readonly className: string;
  readonly current: WorkbenchMode;
  readonly onSelect: (mode: WorkbenchMode) => void;
}) {
  return <div className={className} role="tablist" aria-label="创作工作台">
    {WORKBENCH_MODES.map((mode) => <button
      type="button"
      role="tab"
      key={mode}
      aria-selected={mode === current}
      tabIndex={mode === current ? 0 : -1}
      onKeyDown={(event) => { handleTabKey<WorkbenchMode>(event, WORKBENCH_MODES, current, onSelect); }}
      onClick={() => { onSelect(mode); }}
    >{workbenchLabel(mode)}</button>)}
  </div>;
}
