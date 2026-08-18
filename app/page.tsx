"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Tier = "重点推进" | "持续积累" | "灵活安排";

type Task = {
  id: string;
  title: string;
  detail: string;
  start: string;
  end: string;
  tier: Tier;
  color: string;
};

type RoadmapRange = {
  start: string;
  end: string;
};

type RoadmapExport = {
  version: 3;
  range: RoadmapRange;
  tasks: Task[];
};

type DragState = {
  id: string;
  mode: "move" | "start" | "end";
  startX: number;
  originalStart: string;
  originalEnd: string;
  trackWidth: number;
};

const TASK_STORAGE_KEY = "roadmap-studio-tasks-v2";
const RANGE_STORAGE_KEY = "roadmap-studio-range-v1";
const DEFAULT_RANGE: RoadmapRange = { start: "2026-08-01", end: "2027-08-31" };
const TIERS: Tier[] = ["重点推进", "持续积累", "灵活安排"];

const TIER_META: Record<Tier, { eyebrow: string; description: string }> = {
  重点推进: { eyebrow: "PRIORITY 01", description: "核心目标 · 优先保护" },
  持续积累: { eyebrow: "PRIORITY 02", description: "长期项目 · 稳步推进" },
  灵活安排: { eyebrow: "PRIORITY 03", description: "机动事项 · 按需调整" },
};

const COLORS = ["#1d6b52", "#315ea8", "#7656a8", "#c96d45", "#b48a2c"];

const SAMPLE_TASKS: Task[] = [
  {
    id: "sample-focus",
    title: "示例 · 核心目标",
    detail: "点击左侧文字编辑内容",
    start: "2026-08-15",
    end: "2026-11-20",
    tier: "重点推进",
    color: COLORS[0],
  },
  {
    id: "sample-longterm",
    title: "示例 · 长期项目",
    detail: "拖动色块可移动时间",
    start: "2026-10-05",
    end: "2027-05-25",
    tier: "持续积累",
    color: COLORS[1],
  },
  {
    id: "sample-flex",
    title: "示例 · 灵活安排",
    detail: "拖动两端可改变持续时间",
    start: "2027-03-10",
    end: "2027-04-20",
    tier: "灵活安排",
    color: COLORS[2],
  },
];

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDate(value);
  return Number.isFinite(parsed.getTime()) && toISO(parsed) === value;
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return toISO(date);
}

function diffDays(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

function clampDate(value: string, min: string, max: string) {
  return value < min ? min : value > max ? max : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function formatShort(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function monthSegments(rangeStart: string, rangeEnd: string) {
  const result: { key: string; label: string; year: string; width: number }[] = [];
  const total = diffDays(rangeStart, addDays(rangeEnd, 1));
  let cursor = parseDate(rangeStart);
  while (cursor <= parseDate(rangeEnd)) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const next = new Date(Date.UTC(year, month + 1, 1));
    const segmentEnd = next > parseDate(addDays(rangeEnd, 1)) ? parseDate(addDays(rangeEnd, 1)) : next;
    const days = Math.round((segmentEnd.getTime() - cursor.getTime()) / 86400000);
    result.push({
      key: `${year}-${month}`,
      label: `${month + 1}月`,
      year: month === 0 || result.length === 0 ? String(year) : "",
      width: (days / total) * 100,
    });
    cursor = next;
  }
  return result;
}

function positionFor(task: Task, rangeStart: string, rangeEnd: string) {
  const total = diffDays(rangeStart, addDays(rangeEnd, 1));
  const left = (diffDays(rangeStart, task.start) / total) * 100;
  const width = ((diffDays(task.start, task.end) + 1) / total) * 100;
  return { left: `${left}%`, width: `${Math.max(width, 0.9)}%` };
}

function createBlankTask(rangeStart: string, rangeEnd: string): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: "",
    detail: "",
    start: rangeStart,
    end: addDays(rangeStart, Math.min(30, diffDays(rangeStart, rangeEnd))),
    tier: "重点推进",
    color: COLORS[0],
  };
}

function isRoadmapRange(value: unknown): value is RoadmapRange {
  return (
    typeof value === "object" &&
    value !== null &&
    "start" in value &&
    "end" in value &&
    isISODate(value.start) &&
    isISODate(value.end) &&
    value.start <= value.end
  );
}

function isRoadmapExport(value: unknown): value is RoadmapExport {
  return (
    typeof value === "object" &&
    value !== null &&
    "range" in value &&
    "tasks" in value &&
    isRoadmapRange(value.range) &&
    isTaskArray(value.tasks)
  );
}

function fitTasksToRange(tasks: Task[], rangeStart: string, rangeEnd: string) {
  const available = diffDays(rangeStart, rangeEnd);
  return tasks.map((task) => {
    const duration = Math.min(diffDays(task.start, task.end), available);
    if (task.end < rangeStart) {
      return { ...task, start: rangeStart, end: addDays(rangeStart, duration) };
    }
    if (task.start > rangeEnd) {
      return { ...task, start: addDays(rangeEnd, -duration), end: rangeEnd };
    }
    return {
      ...task,
      start: clampDate(task.start, rangeStart, rangeEnd),
      end: clampDate(task.end, rangeStart, rangeEnd),
    };
  });
}

function isTaskArray(value: unknown): value is Task[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "title" in item &&
        "start" in item &&
        "end" in item &&
        "tier" in item,
    )
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(SAMPLE_TASKS);
  const [timelineStart, setTimelineStart] = useState(DEFAULT_RANGE.start);
  const [timelineEnd, setTimelineEnd] = useState(DEFAULT_RANGE.end);
  const [rangeDraft, setRangeDraft] = useState<RoadmapRange | null>(null);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"全部" | Tier>("全部");
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const months = useMemo(() => monthSegments(timelineStart, timelineEnd), [timelineEnd, timelineStart]);
  const boardMinWidth = Math.max(1060, 250 + months.length * 72);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedTasks = localStorage.getItem(TASK_STORAGE_KEY);
        const savedRange = localStorage.getItem(RANGE_STORAGE_KEY);
        let activeRange = DEFAULT_RANGE;
        if (savedRange) {
          const parsedRange: unknown = JSON.parse(savedRange);
          if (isRoadmapRange(parsedRange)) {
            activeRange = parsedRange;
            setTimelineStart(parsedRange.start);
            setTimelineEnd(parsedRange.end);
          }
        }
        if (savedTasks) {
          const parsed: unknown = JSON.parse(savedTasks);
          if (isTaskArray(parsed)) setTasks(fitTasksToRange(parsed, activeRange.start, activeRange.end));
        }
      } catch {
        setNotice("本地数据未能读取，已显示示例计划。");
      }
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
      localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify({ start: timelineStart, end: timelineEnd }));
    }
  }, [tasks, timelineEnd, timelineStart, ready]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (event: PointerEvent) => {
      const total = diffDays(timelineStart, addDays(timelineEnd, 1));
      const deltaDays = Math.round(((event.clientX - drag.startX) / drag.trackWidth) * total);
      setTasks((current) =>
        current.map((task) => {
          if (task.id !== drag.id) return task;
          const duration = diffDays(drag.originalStart, drag.originalEnd);
          if (drag.mode === "move") {
            let nextStart = addDays(drag.originalStart, deltaDays);
            let nextEnd = addDays(drag.originalEnd, deltaDays);
            if (nextStart < timelineStart) {
              nextStart = timelineStart;
              nextEnd = addDays(timelineStart, duration);
            }
            if (nextEnd > timelineEnd) {
              nextEnd = timelineEnd;
              nextStart = addDays(timelineEnd, -duration);
            }
            return { ...task, start: nextStart, end: nextEnd };
          }
          if (drag.mode === "start") {
            return { ...task, start: clampDate(addDays(drag.originalStart, deltaDays), timelineStart, drag.originalEnd) };
          }
          return { ...task, end: clampDate(addDays(drag.originalEnd, deltaDays), drag.originalStart, timelineEnd) };
        }),
      );
    };
    const handleUp = () => setDrag(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, timelineEnd, timelineStart]);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => filter === "全部" || task.tier === filter),
    [filter, tasks],
  );

  const groupedTasks = useMemo(
    () => TIERS.map((tier) => ({ tier, tasks: visibleTasks.filter((task) => task.tier === tier) })).filter((group) => group.tasks.length),
    [visibleTasks],
  );

  const startDrag = (event: ReactPointerEvent, task: Task, mode: DragState["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest(".timeline-track") as HTMLElement | null;
    if (!track) return;
    setDrag({
      id: task.id,
      mode,
      startX: event.clientX,
      originalStart: task.start,
      originalEnd: task.end,
      trackWidth: track.getBoundingClientRect().width,
    });
  };

  const moveByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, task: Task) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const duration = diffDays(task.start, task.end);
    let start = addDays(task.start, delta);
    let end = addDays(task.end, delta);
    if (start < timelineStart) {
      start = timelineStart;
      end = addDays(start, duration);
    }
    if (end > timelineEnd) {
      end = timelineEnd;
      start = addDays(end, -duration);
    }
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, start, end } : item)));
  };

  const saveTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    if (!editing.title.trim()) {
      setNotice("请填写任务名称。");
      return;
    }
    if (editing.start > editing.end) {
      setNotice("结束日期不能早于开始日期。");
      return;
    }
    setTasks((current) => {
      const exists = current.some((task) => task.id === editing.id);
      return exists
        ? current.map((task) => (task.id === editing.id ? { ...editing, title: editing.title.trim() } : task))
        : [...current, { ...editing, title: editing.title.trim() }];
    });
    setEditing(null);
    setNotice("计划已保存到本机。");
  };

  const exportTasks = () => {
    const payload: RoadmapExport = {
      version: 3,
      range: { start: timelineStart, end: timelineEnd },
      tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `roadmap-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("备份文件已导出。");
  };

  const importTasks = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (isRoadmapExport(parsed)) {
        setTimelineStart(parsed.range.start);
        setTimelineEnd(parsed.range.end);
        setTasks(fitTasksToRange(parsed.tasks, parsed.range.start, parsed.range.end));
        setNotice(`已导入时间范围和 ${parsed.tasks.length} 个任务。`);
      } else if (isTaskArray(parsed)) {
        setTasks(fitTasksToRange(parsed, timelineStart, timelineEnd));
        setNotice(`已导入 ${parsed.length} 个任务。`);
      } else {
        throw new Error("invalid");
      }
    } catch {
      setNotice("导入失败：请选择本应用导出的 JSON 文件。");
    }
    event.target.value = "";
  };

  const saveRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rangeDraft) return;
    if (!rangeDraft.start || !rangeDraft.end || rangeDraft.start > rangeDraft.end) {
      setNotice("时间线结束日期不能早于开始日期。");
      return;
    }
    setTasks((current) => fitTasksToRange(current, rangeDraft.start, rangeDraft.end));
    setTimelineStart(rangeDraft.start);
    setTimelineEnd(rangeDraft.end);
    setRangeDraft(null);
    setNotice("Roadmap 总时间线已更新。");
  };

  const totalDays = useMemo(
    () => tasks.reduce((sum, task) => sum + diffDays(task.start, task.end) + 1, 0),
    [tasks],
  );

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-topline">
          <span>ROADMAP STUDIO</span>
          <span className="save-state"><i /> 本机自动保存</span>
        </div>
        <div className="hero-main">
          <div>
            <p className="hero-kicker">{timelineStart.replaceAll("-", ".")} — {timelineEnd.replaceAll("-", ".")}</p>
            <h1>把目标，放进时间里。</h1>
            <p className="hero-copy">拖动任务调整时间，拉伸两端改变周期。所有计划都保存在你的浏览器中。</p>
          </div>
          <button className="primary-button" onClick={() => setEditing(createBlankTask(timelineStart, timelineEnd))}>
            <span aria-hidden="true">＋</span> 添加任务
          </button>
        </div>
        <div className="stats" aria-label="计划概览">
          <div><strong>{tasks.length}</strong><span>个任务</span></div>
          <div><strong>{totalDays}</strong><span>累计计划天数</span></div>
          <div><strong>{new Set(tasks.map((task) => task.tier)).size}</strong><span>个优先层级</span></div>
          <div className="deadline-stat"><strong>{timelineEnd.replaceAll("-", ".")}</strong><span>当前终点线</span></div>
        </div>
      </header>

      <section className="workspace" aria-label="路线图编辑区">
        <div className="toolbar">
          <div className="filter-tabs" aria-label="筛选任务">
            {(["全部", ...TIERS] as const).map((item) => (
              <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                {item}
                <span>{item === "全部" ? tasks.length : tasks.filter((task) => task.tier === item).length}</span>
              </button>
            ))}
          </div>
          <div className="utility-actions">
            <button className="range-button" onClick={() => setRangeDraft({ start: timelineStart, end: timelineEnd })}>设置时间范围</button>
            <button onClick={() => fileInput.current?.click()}>导入</button>
            <button onClick={exportTasks}>导出</button>
            <input ref={fileInput} type="file" accept="application/json" onChange={importTasks} hidden />
          </div>
        </div>

        <div className="timeline-scroll">
          <div className="timeline-board" style={{ minWidth: `${boardMinWidth}px` }}>
            <div className="timeline-header timeline-grid">
              <div className="task-heading">
                <span>任务</span>
                <small>点击任务可编辑</small>
              </div>
              <div className="month-track">
                {months.map((month) => (
                  <div key={month.key} className="month" style={{ width: `${month.width}%` }}>
                    <strong>{month.label}</strong>
                    {month.year && <small>{month.year}</small>}
                  </div>
                ))}
                <div className="finish-line" aria-label="终点线"><span>终点</span></div>
              </div>
            </div>

            {groupedTasks.map((group) => (
              <section className="task-group" key={group.tier}>
                <div className="group-heading">
                  <span>{TIER_META[group.tier].eyebrow}</span>
                  <strong>{group.tier}</strong>
                  <small>{TIER_META[group.tier].description}</small>
                </div>
                {group.tasks.map((task) => (
                  <div className="task-row timeline-grid" key={task.id}>
                    <button className="task-label" onClick={() => setEditing({ ...task })}>
                      <span className="task-dot" style={{ background: task.color }} />
                      <span><strong>{task.title}</strong><small>{task.detail || "暂无备注"}</small></span>
                    </button>
                    <div className="timeline-track">
                      <div className="grid-lines" aria-hidden="true">
                        {months.map((month) => <i key={month.key} style={{ width: `${month.width}%` }} />)}
                      </div>
                      <button
                        className={`task-bar ${drag?.id === task.id ? "dragging" : ""}`}
                        style={{ ...positionFor(task, timelineStart, timelineEnd), background: task.color }}
                        onPointerDown={(event) => startDrag(event, task, "move")}
                        onDoubleClick={() => setEditing({ ...task })}
                        onKeyDown={(event) => moveByKeyboard(event, task)}
                        title={`${task.title}：${formatDate(task.start)} 至 ${formatDate(task.end)}`}
                        aria-label={`${task.title}，${formatDate(task.start)}至${formatDate(task.end)}。可用左右方向键移动一天。`}
                      >
                        <span
                          className="resize-handle left"
                          onPointerDown={(event) => startDrag(event, task, "start")}
                          aria-hidden="true"
                        />
                        <span className="bar-text">{task.title}<small>{formatShort(task.start)} — {formatShort(task.end)}</small></span>
                        <span
                          className="resize-handle right"
                          onPointerDown={(event) => startDrag(event, task, "end")}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            ))}

            {!visibleTasks.length && (
              <div className="empty-state">
                <strong>这个分类还没有任务</strong>
                <p>添加一个任务，让计划开始成形。</p>
                <button onClick={() => setEditing(createBlankTask(timelineStart, timelineEnd))}>添加任务</button>
              </div>
            )}
          </div>
        </div>

        <footer className="board-footer">
          <p><span className="gesture-icon">↔</span><strong>拖动整条</strong>移动任务，<strong>拖动两端</strong>调整持续时间，<strong>双击</strong>打开详细编辑。</p>
          <button onClick={() => setDeleteTarget({ ...SAMPLE_TASKS[0], id: "__reset__", title: "恢复示例数据" })}>恢复示例</button>
        </footer>
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}>
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="modal-heading">
              <div><span>PLAN DETAILS</span><h2 id="editor-title">{tasks.some((task) => task.id === editing.id) ? "编辑任务" : "添加新任务"}</h2></div>
              <button className="icon-button" aria-label="关闭" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={saveTask}>
              <label>
                <span>任务名称</span>
                <input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="例如：完成作品集" />
              </label>
              <label>
                <span>简短备注</span>
                <input value={editing.detail} onChange={(event) => setEditing({ ...editing, detail: event.target.value })} placeholder="目标、阶段或提醒" />
              </label>
              <div className="form-row">
                <label><span>开始日期</span><input type="date" min={timelineStart} max={timelineEnd} value={editing.start} onChange={(event) => setEditing({ ...editing, start: event.target.value })} /></label>
                <label><span>结束日期</span><input type="date" min={timelineStart} max={timelineEnd} value={editing.end} onChange={(event) => setEditing({ ...editing, end: event.target.value })} /></label>
              </div>
              <label>
                <span>优先层级</span>
                <select value={editing.tier} onChange={(event) => setEditing({ ...editing, tier: event.target.value as Tier })}>
                  {TIERS.map((tier) => <option key={tier}>{tier}</option>)}
                </select>
              </label>
              <fieldset className="color-field">
                <legend>任务颜色</legend>
                <div>{COLORS.map((color) => <button type="button" key={color} className={editing.color === color ? "selected" : ""} style={{ background: color }} aria-label={`选择颜色 ${color}`} onClick={() => setEditing({ ...editing, color })} />)}</div>
              </fieldset>
              <div className="modal-actions">
                {tasks.some((task) => task.id === editing.id) && <button type="button" className="danger-button" onClick={() => { setDeleteTarget(editing); setEditing(null); }}>删除任务</button>}
                <span />
                <button type="button" className="secondary-button" onClick={() => setEditing(null)}>取消</button>
                <button type="submit" className="primary-button compact">保存任务</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {rangeDraft && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRangeDraft(null)}>
          <section className="editor-modal range-modal" role="dialog" aria-modal="true" aria-labelledby="range-title">
            <div className="modal-heading">
              <div><span>ROADMAP RANGE</span><h2 id="range-title">设置总时间线</h2></div>
              <button className="icon-button" aria-label="关闭" onClick={() => setRangeDraft(null)}>×</button>
            </div>
            <form onSubmit={saveRange}>
              <p className="range-note">选择整条 Roadmap 的开始和结束日期。调整后，超出新范围的任务会自动移入时间线内。</p>
              <div className="form-row">
                <label><span>时间线开始</span><input type="date" required value={rangeDraft.start} onChange={(event) => setRangeDraft({ ...rangeDraft, start: event.target.value })} /></label>
                <label><span>时间线结束</span><input type="date" required value={rangeDraft.end} onChange={(event) => setRangeDraft({ ...rangeDraft, end: event.target.value })} /></label>
              </div>
              <div className="range-preview">
                <span>计划跨度</span>
                <strong>{rangeDraft.start && rangeDraft.end && rangeDraft.start <= rangeDraft.end ? `${diffDays(rangeDraft.start, rangeDraft.end) + 1} 天` : "—"}</strong>
              </div>
              <div className="modal-actions">
                <span />
                <button type="button" className="secondary-button" onClick={() => setRangeDraft(null)}>取消</button>
                <button type="submit" className="primary-button compact">应用时间范围</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}>
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <span className="confirm-mark">!</span>
            <h2 id="confirm-title">{deleteTarget.id === "__reset__" ? "恢复示例计划？" : "删除这个任务？"}</h2>
            <p>{deleteTarget.id === "__reset__" ? "当前任务将被示例数据替换。建议先导出一份备份。" : `“${deleteTarget.title}”将从时间表中移除。`}</p>
            <div>
              <button className="secondary-button" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="danger-button solid" onClick={() => {
                if (deleteTarget.id === "__reset__") {
                  setTasks(SAMPLE_TASKS);
                  setTimelineStart(DEFAULT_RANGE.start);
                  setTimelineEnd(DEFAULT_RANGE.end);
                }
                else setTasks((current) => current.filter((task) => task.id !== deleteTarget.id));
                setDeleteTarget(null);
                setNotice(deleteTarget.id === "__reset__" ? "已恢复示例计划。" : "任务已删除。");
              }}>{deleteTarget.id === "__reset__" ? "恢复" : "确认删除"}</button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
