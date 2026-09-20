import { Download, Eraser, Redo2, Undo2 } from "lucide-react";
import type { PenStyle } from "../ink";
import type { ToolMode } from "../model";
import { primaryKey } from "../platform";

export default function InkToolbar({
  tool,
  pen,
  count,
  canUndo,
  canRedo,
  exporting,
  onTool,
  onPen,
  onUndo,
  onRedo,
  onExport,
}: {
  tool: ToolMode;
  pen: PenStyle;
  count: number;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  onTool: (tool: ToolMode) => void;
  onPen: (pen: PenStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
}) {
  return (
    <div className="ink-toolbar" role="toolbar" aria-label="手写批注工具">
      <label>
        笔色
        <input
          type="color"
          aria-label="画笔颜色"
          value={pen.color}
          onChange={(e) => onPen({ ...pen, color: e.target.value })}
        />
      </label>
      <label>
        粗细
        <select
          aria-label="画笔粗细"
          value={pen.width}
          onChange={(e) => onPen({ ...pen, width: Number(e.target.value) })}
        >
          <option value="1">细 · 1</option>
          <option value="2">标准 · 2</option>
          <option value="4">粗 · 4</option>
          <option value="8">特粗 · 8</option>
        </select>
      </label>
      <button
        className={`tool-button ${tool === "eraser" ? "active" : ""}`}
        aria-pressed={tool === "eraser"}
        title="擦除整条手写笔迹"
        onClick={() => onTool(tool === "eraser" ? "pen" : "eraser")}
      >
        <Eraser size={16} />
        橡皮擦
      </button>
      <button
        className="icon-button"
        aria-label="撤销手写"
        title={`撤销手写（${primaryKey} + Z）`}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="重做手写"
        title={`重做手写（${primaryKey} + Shift + Z）`}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 size={16} />
      </button>
      <span className="ink-hint">
        {tool === "eraser"
          ? "划过笔迹可整笔擦除"
          : "用鼠标或触控笔书写 · Esc 返回选择"}{" "}
        · {count} 笔
      </span>
      <button
        className="tool-button ink-export"
        disabled={!count || exporting}
        onClick={onExport}
      >
        <Download size={15} />
        导出手写 PDF
      </button>
    </div>
  );
}
