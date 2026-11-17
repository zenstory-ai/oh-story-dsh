import { workbenchLabel, type WorkbenchMode } from "./file-activity.js";
import { handleTabKey } from "./workbench-ui.js";
import { WORKBENCH_MODES } from "./workbench-settings.js";

/** The one cross-workbench navigation; each workbench only styles it through `className`. */
export function WorkbenchModeTabs({ className, current, onSelect, modes = WORKBENCH_MODES }: {
  readonly className: string;
  readonly current: WorkbenchMode;
  readonly onSelect: (mode: WorkbenchMode) => void;
  readonly modes?: readonly WorkbenchMode[] | undefined;
}) {
  return <div className={className} role="tablist" aria-label="创作工作台">
    {modes.map((mode) => <button
      type="button"
      role="tab"
      key={mode}
      aria-selected={mode === current}
      tabIndex={mode === current ? 0 : -1}
      onKeyDown={(event) => { handleTabKey<WorkbenchMode>(event, modes, current, onSelect); }}
      onClick={() => { onSelect(mode); }}
    >{workbenchLabel(mode)}</button>)}
  </div>;
}
