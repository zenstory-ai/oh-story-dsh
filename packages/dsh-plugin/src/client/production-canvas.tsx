import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { DramaDocumentTarget, DramaEpisodeProduction } from "./drama-production.js";
import type { CanvasPoint, ProductionJob, ProductionMediaVersion } from "./production-runtime.js";
import { initialReadableViewport, type CanvasViewport } from "./canvas-viewport.js";
import { productionCanvasEdges, productionCanvasNodes, type ProductionCanvasNode } from "./production-canvas-model.js";
import { nodeRects, useInfiniteCanvas } from "./use-infinite-canvas.js";

export type DramaMediaVersion = Omit<ProductionMediaVersion, "kind"> & {
  readonly kind: ProductionMediaVersion["kind"] | "audio";
};

const AUDIO_FILE_PATTERN = /\.(?:mp3|wav|m4a|aac|ogg|flac|opus)$/iu;

export function isAudioMediaVersion(version: DramaMediaVersion): boolean {
  return version.kind === "audio" || (version.path !== undefined && AUDIO_FILE_PATTERN.test(version.path));
}

function selectCanvasVersion(
  node: ProductionCanvasNode,
  versions: readonly DramaMediaVersion[],
  selections: Readonly<Record<string, string>>
): DramaMediaVersion | undefined {
  const explicit = selections[node.id] ?? (node.groupId === undefined ? undefined : selections[node.groupId]);
  return versions.find((version) => version.id === explicit) ?? versions.at(-1);
}

export interface ProductionCanvasProps {
  readonly production: DramaEpisodeProduction;
  readonly selectedId: string | undefined;
  readonly canvas: Readonly<Record<string, CanvasPoint>>;
  /** Undefined until the creator pans or zooms this episode; the first view then frames the nodes. */
  readonly viewport: CanvasViewport | undefined;
  readonly onSelect: (id: string | undefined) => void;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onCanvasChange: (canvas: Record<string, CanvasPoint>) => void;
  readonly onViewportChange: (viewport: CanvasViewport) => void;
  /** Existing DSH-owned media only. The canvas never invents generated results. */
  readonly versions?: readonly DramaMediaVersion[] | undefined;
  readonly jobs?: readonly ProductionJob[] | undefined;
  readonly selections?: Readonly<Record<string, string>> | undefined;
  readonly documents?: Readonly<Record<string, string>> | undefined;
  readonly onSelectionsChange?: ((value: Record<string, string>) => void) | undefined;
  readonly onPrepare?: ((targetId: string, kind: "image" | "video", prompt: string) => void | Promise<void>) | undefined;
  readonly onWriteImagePrompts?: ((node: ProductionCanvasNode) => void | Promise<void>) | undefined;
  readonly onOpenMedia?: ((path: string) => void) | undefined;
  readonly onContinueInChat?: ((targetId: string) => void) | undefined;
}

export function ProductionCanvas(props: ProductionCanvasProps) {
  const nodes = useMemo(() => productionCanvasNodes(props.production, props.documents), [props.production, props.documents]);
  const edges = useMemo(
    () => productionCanvasEdges(props.production, new Set(nodes.map((node) => node.id))),
    [props.production, nodes]
  );
  const versions = props.versions ?? [];
  const selections = props.selections ?? {};
  const navigate = (node: ProductionCanvasNode) => {
    if (node.target !== undefined) props.onNavigate(node.target);
  };

  const canvas = useInfiniteCanvas({
    nodes,
    positions: props.canvas,
    viewport: props.viewport,
    selectedId: props.selectedId,
    activateOnSpace: true,
    defaultViewport: (_rects, size, positions) => initialReadableViewport(nodeRects(readableNodes(nodes), positions), size),
    onActivate: navigate,
    onCommit: (patch) => {
      if (patch.positions !== undefined) props.onCanvasChange(patch.positions);
      if (patch.viewport !== undefined) props.onViewportChange(patch.viewport);
      if (patch.selectedId !== undefined) props.onSelect(patch.selectedId ?? undefined);
    }
  });

  const selectedNode = nodes.find((node) => node.id === props.selectedId);
  const gridSize = 20 * canvas.viewport.zoom;

  return <section className="oh-story-canvas-shell" aria-label="短剧故事与镜头无限画布">
    <div className="oh-story-canvas-toolbar">
      <div className="oh-story-canvas-help" id="oh-story-canvas-help">拖动空白处平移 · 滚轮缩放 · 方向键移动卡片 · 双击打开原文</div>
      <div className="oh-story-canvas-controls">
        <button type="button" aria-label="缩小画布" onClick={canvas.zoomOut}>−</button>
        <span aria-live="polite">{Math.round(canvas.viewport.zoom * 100)}%</span>
        <button type="button" aria-label="放大画布" onClick={canvas.zoomIn}>＋</button>
        <button type="button" onClick={canvas.fitAll}>适应</button>
        <button type="button" onClick={canvas.resetLayout}>复位</button>
      </div>
    </div>
    <div
      ref={canvas.viewportRef}
      className="oh-story-canvas-viewport"
      role="application"
      aria-roledescription="无限画布"
      aria-label="画布视野"
      aria-describedby="oh-story-canvas-help"
      tabIndex={0}
      data-panning={canvas.panning || undefined}
      style={{ backgroundPosition: `${String(canvas.viewport.x)}px ${String(canvas.viewport.y)}px`, backgroundSize: `${String(gridSize)}px ${String(gridSize)}px` }}
      onPointerDown={canvas.startPan}
      onKeyDown={canvas.onViewportKeyDown}
    >
      <div className="oh-story-canvas" style={{ transform: `translate(${String(canvas.viewport.x)}px, ${String(canvas.viewport.y)}px) scale(${String(canvas.viewport.zoom)})` }}>
        <CanvasGroupLabels nodes={nodes} />
        <svg aria-hidden="true">{edges.map((edge) => {
          const from = nodes.find((node) => node.id === edge.from);
          const to = nodes.find((node) => node.id === edge.to);
          const a = from === undefined ? undefined : canvas.positions[from.id];
          const b = to === undefined ? undefined : canvas.positions[to.id];
          if (a === undefined || b === undefined || from === undefined || to === undefined) return null;
          const y1 = a.y + from.height / 2;
          const y2 = b.y + to.height / 2;
          const x1 = a.x + from.width;
          const bend = Math.max(60, Math.abs(b.x - x1) / 2);
          const active = edge.to === props.selectedId || edge.from === props.selectedId;
          return <g data-edge-kind={edge.kind} key={`${edge.kind}:${edge.from}:${edge.to}`}>
            <path className="oh-story-canvas-edge" data-active={active || undefined} d={`M ${String(x1)} ${String(y1)} C ${String(x1 + bend)} ${String(y1)}, ${String(b.x - bend)} ${String(y2)}, ${String(b.x)} ${String(y2)}`} />
            <text className="oh-story-canvas-edge-label" data-active={active || undefined} x={(x1 + b.x) / 2} y={(y1 + y2) / 2 - 7}>{edge.label}</text>
          </g>;
        })}</svg>
        {nodes.map((node) => <CanvasNodeCard
          key={node.id}
          node={node}
          point={canvas.positions[node.id] ?? node.initial}
          selected={node.id === props.selectedId}
          dragging={canvas.draggingId === node.id}
          relations={edges.filter((edge) => edge.from === node.id || edge.to === node.id).length}
          versions={versions.filter((version) => version.targetId === node.id || (node.groupId !== undefined && version.targetId === node.groupId))}
          job={props.jobs?.findLast((job) => job.targetId === node.id || (node.groupId !== undefined && job.targetId === node.groupId))}
          selections={selections}
          onSelectionsChange={props.onSelectionsChange}
          onPrepare={props.onPrepare === undefined ? undefined : (targetId, kind, prompt) => {
            props.onSelect(targetId);
            return props.onPrepare?.(targetId, kind, prompt);
          }}
          onWriteImagePrompts={props.onWriteImagePrompts === undefined ? undefined : (target) => {
            props.onSelect(target.id);
            return props.onWriteImagePrompts?.(target);
          }}
          onContinueInChat={props.onContinueInChat}
          onOpenMedia={props.onOpenMedia}
          onKeyDown={canvas.onNodeKeyDown}
          onPointerDown={canvas.startDrag}
          onNavigate={navigate}
        />)}
      </div>
    </div>
    {selectedNode !== undefined && <div className="oh-story-canvas-context" aria-live="polite">
      <div className="oh-story-canvas-context-copy"><small>已选中</small><strong>{selectedNode.title}</strong></div>
      {selectedNode.target !== undefined && <button type="button" onClick={() => { navigate(selectedNode); }}>打开原文</button>}
      {props.onContinueInChat !== undefined && <button type="button" onClick={() => { props.onContinueInChat?.(selectedNode.id); }}>在 Chat 中继续</button>}
    </div>}
  </section>;
}

function CanvasNodeCard(props: {
  readonly node: ProductionCanvasNode;
  readonly point: CanvasPoint;
  readonly selected: boolean;
  readonly dragging: boolean;
  readonly relations: number;
  readonly versions: readonly DramaMediaVersion[];
  readonly job: ProductionJob | undefined;
  readonly selections: Readonly<Record<string, string>>;
  readonly onSelectionsChange?: ((value: Record<string, string>) => void) | undefined;
  readonly onPrepare?: ProductionCanvasProps["onPrepare"];
  readonly onWriteImagePrompts?: ProductionCanvasProps["onWriteImagePrompts"];
  readonly onContinueInChat?: ProductionCanvasProps["onContinueInChat"];
  readonly onOpenMedia?: ProductionCanvasProps["onOpenMedia"];
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>, node: ProductionCanvasNode) => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: string) => void;
  readonly onNavigate: (node: ProductionCanvasNode) => void;
}) {
  const selectedVersion = selectCanvasVersion(props.node, props.versions, props.selections);
  const canWriteImagePrompts = props.node.needsImagePrompt === true && (props.onWriteImagePrompts !== undefined || props.onContinueInChat !== undefined);
  return <article
    className="oh-story-canvas-node"
    tabIndex={0}
    role="group"
    aria-label={`${kindLabel(props.node.kind)} ${props.node.title}，${String(props.relations)} 条关系`}
    title={`来源条目：${props.node.id}`}
    data-node-type={props.node.kind}
    data-selected={props.selected || undefined}
    data-dragging={props.dragging || undefined}
    style={{ left: props.point.x, top: props.point.y, width: props.node.width, minHeight: props.node.height, height: "auto" }}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      props.onKeyDown(event, props.node);
    }}
    onPointerDown={(event) => { props.onPointerDown(event, props.node.id); }}
    onDoubleClick={() => { props.onNavigate(props.node); }}
  >
    <header className="oh-story-canvas-node-head"><div><small>{props.node.eyebrow}</small><strong>{props.node.title}</strong></div><span>{props.relations} 条关系</span></header>
    {props.node.kind !== "story" && <div className="oh-story-canvas-node-media">
      {selectedVersion === undefined
        ? <div className="oh-story-canvas-node-placeholder" aria-hidden="true">{props.node.kind === "shot" ? "待准备画面" : "待准备素材"}</div>
        : <MediaPreview version={selectedVersion} interactive />}
    </div>}
    <div className="oh-story-canvas-node-copy">{props.node.description !== undefined && <p>{props.node.description}</p>}</div>
    <div className="oh-story-canvas-node-meta"><span>{canvasNodeStatus(props.node, selectedVersion, props.job)}</span>{props.versions.length > 0 && <span>{props.versions.length} 个版本</span>}</div>
    {props.versions.length > 1 && <div className="oh-story-canvas-node-versions" aria-label={`${props.node.title} 成果版本`}>{props.versions.map((version, index) => <button
      type="button"
      key={version.id}
      aria-label={`选择 ${props.node.title} 版本 ${String(index + 1)}`}
      aria-pressed={version.id === selectedVersion?.id}
      data-selected={version.id === selectedVersion?.id || undefined}
      onPointerDown={stopPointer}
      onClick={(event) => { event.stopPropagation(); props.onSelectionsChange?.({ ...props.selections, [props.node.id]: version.id }); }}
    ><MediaPreview version={version} /><span>V{String(index + 1)}</span></button>)}</div>}
    <footer className="oh-story-canvas-node-actions">
      {canWriteImagePrompts
        ? <button type="button" onPointerDown={stopPointer} onClick={(event) => {
            event.stopPropagation();
            if (props.onWriteImagePrompts !== undefined) void props.onWriteImagePrompts(props.node);
            else props.onContinueInChat?.(props.node.id);
          }}>去写图片提示词</button>
        : props.node.prompt !== undefined && props.onPrepare !== undefined && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); void props.onPrepare?.(props.node.id, "image", props.node.prompt!); }}>{props.node.kind === "shot" ? "准备关键帧" : "准备素材"}</button>}
      {props.node.videoPrompt !== undefined && props.onPrepare !== undefined && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); void props.onPrepare?.(props.node.id, "video", props.node.videoPrompt!); }}>准备视频</button>}
      {selectedVersion?.path !== undefined && props.onOpenMedia !== undefined && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); props.onOpenMedia?.(selectedVersion.path!); }}>打开文件</button>}
    </footer>
  </article>;
}

function CanvasGroupLabels({ nodes }: { readonly nodes: readonly ProductionCanvasNode[] }) {
  const labels = (["story", "asset", "shot"] as const).flatMap((kind) => {
    const group = nodes.filter((node) => node.kind === kind);
    if (group.length === 0) return [];
    return [{ kind, x: Math.min(...group.map((node) => node.initial.x)), y: Math.min(...group.map((node) => node.initial.y)) - 34 }];
  });
  return <>{labels.map((label) => <div className="oh-story-canvas-group-label" data-group={label.kind} key={label.kind} style={{ left: label.x, top: label.y }}>{kindLabel(label.kind)}</div>)}</>;
}

function MediaPreview({ version, interactive = false }: { readonly version: DramaMediaVersion; readonly interactive?: boolean }) {
  if (isAudioMediaVersion(version)) {
    return <audio className="oh-story-media-preview oh-story-audio-preview" src={version.url} controls={interactive} preload="metadata" onPointerDown={interactive ? stopPointer : undefined} onClick={interactive ? stopClick : undefined} />;
  }
  return version.kind === "image"
    ? <img className="oh-story-media-preview" src={version.url} alt={version.targetId} loading="lazy" draggable={false} />
    : <video className="oh-story-media-preview" src={version.url} controls={interactive} muted={!interactive} preload="metadata" onPointerDown={interactive ? stopPointer : undefined} onClick={interactive ? stopClick : undefined} />;
}

export function canvasNodeStatus(node: ProductionCanvasNode, version: DramaMediaVersion | undefined, job?: ProductionJob): string {
  if (job !== undefined) {
    if (job.status === "awaiting_confirmation") return "等待确认";
    if (job.status === "pending") return "等待生成";
    if (job.status === "running") return "正在生成";
    if (job.status === "dispatched_unknown") return "成果待核对";
    if (job.status === "failed") return "生成失败，请查看记录";
    if (job.status === "canceled") return "已停止生成";
  }
  if (version !== undefined) {
    if (isAudioMediaVersion(version)) return "已有音频";
    return version.kind === "video" ? "已有视频" : "已有画面";
  }
  if (node.kind === "story") return "来自剧本";
  if (node.needsImagePrompt === true) return "待写图片提示词";
  return node.kind === "shot" ? "等待画面" : "等待素材";
}

function readableNodes(nodes: readonly ProductionCanvasNode[]): ProductionCanvasNode[] {
  return [
    nodes.find((node) => node.kind === "story"),
    nodes.find((node) => node.kind === "asset"),
    ...nodes.filter((node) => node.kind === "shot").slice(0, 1)
  ].filter((node): node is ProductionCanvasNode => node !== undefined);
}

function kindLabel(kind: ProductionCanvasNode["kind"]): string {
  if (kind === "story") return "故事";
  if (kind === "asset") return "人物与场景";
  return "镜头";
}

function stopPointer(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopClick(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}
