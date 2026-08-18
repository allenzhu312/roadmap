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
import type { CSSProperties } from "react";

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

type ColumnResizeState = {
  startX: number;
  originalWidth: number;
};

const TASK_STORAGE_KEY = "roadmap-studio-tasks-v2";
const RANGE_STORAGE_KEY = "roadmap-studio-range-v1";
const LABEL_WIDTH_STORAGE_KEY = "roadmap-studio-label-width-v1";
const DEFAULT_RANGE: RoadmapRange = { start: "2026-08-01", end: "2027-08-31" };
const DEFAULT_LABEL_WIDTH = 250;
const MIN_LABEL_WIDTH = 185;
const MAX_LABEL_WIDTH = 680;
const TIERS: Tier[] = ["重点推进", "持续积累", "灵活安排"];

const TIER_META: Record<Tier, { eyebrow: string; description: string }> = {
  重点推进: { eyebrow: "PRIORITY 01", description: "核心目标 · 优先保护" },
  持续积累: { eyebrow: "PRIORITY 02", description: "长期项目 · 稳步推进" },
  灵活安排: { eyebrow: "PRIORITY 03", description: "机动事项 · 按需调整" },
};

const TIER_DEFAULT_COLOR: Record<Tier, string> = {
  重点推进: "#d35f3f",
  持续积累: "#315ea8",
  灵活安排: "#7656a8",
};

const COLORS = [
  TIER_DEFAULT_COLOR.重点推进,
  TIER_DEFAULT_COLOR.持续积累,
  TIER_DEFAULT_COLOR.灵活安排,
  "#1d6b52",
  "#b48a2c",
];

const SAMPLE_TASKS: Task[] = [
  {
    id: "sample-focus",
    title: "示例 · 核心目标",
    detail: "点击左侧文字编辑内容",
    start: "2026-08-15",
    end: "2026-11-20",
    tier: "重点推进",
    color: TIER_DEFAULT_COLOR.重点推进,
  },
  {
    id: "sample-longterm",
    title: "示例 · 长期项目",
    detail: "拖动色块可移动时间",
    start: "2026-10-05",
    end: "2027-05-25",
    tier: "持续积累",
    color: TIER_DEFAULT_COLOR.持续积累,
  },
  {
    id: "sample-flex",
    title: "示例 · 灵活安排",
    detail: "拖动两端可改变持续时间",
    start: "2027-03-10",
    end: "2027-04-20",
    tier: "灵活安排",
    color: TIER_DEFAULT_COLOR.灵活安排,
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
    color: TIER_DEFAULT_COLOR.重点推进,
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

function migrateSampleColors(tasks: Task[]) {
  return tasks.map((task) => {
    if (task.id === "sample-focus" && task.tier === "重点推进" && task.color === "#1d6b52") {
      return { ...task, color: TIER_DEFAULT_COLOR.重点推进 };
    }
    return task;
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

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const content = text.trim();
  if (!content) return [];
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(content)) {
    const candidate = `${line}${character}`;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function roundedCanvasRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(SAMPLE_TASKS);
  const [timelineStart, setTimelineStart] = useState(DEFAULT_RANGE.start);
  const [timelineEnd, setTimelineEnd] = useState(DEFAULT_RANGE.end);
  const [rangeDraft, setRangeDraft] = useState<RoadmapRange | null>(null);
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"全部" | Tier>("全部");
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [columnResize, setColumnResize] = useState<ColumnResizeState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const months = useMemo(() => monthSegments(timelineStart, timelineEnd), [timelineEnd, timelineStart]);
  const boardMinWidth = Math.max(1060, labelWidth + months.length * 72);
  const boardStyle = {
    minWidth: `${boardMinWidth}px`,
    "--label-width": `${labelWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedTasks = localStorage.getItem(TASK_STORAGE_KEY);
        const savedRange = localStorage.getItem(RANGE_STORAGE_KEY);
        const savedLabelWidth = Number(localStorage.getItem(LABEL_WIDTH_STORAGE_KEY));
        if (Number.isFinite(savedLabelWidth) && savedLabelWidth > 0) {
          setLabelWidth(clampNumber(savedLabelWidth, MIN_LABEL_WIDTH, MAX_LABEL_WIDTH));
        }
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
          if (isTaskArray(parsed)) {
            setTasks(migrateSampleColors(fitTasksToRange(parsed, activeRange.start, activeRange.end)));
          }
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
      localStorage.setItem(LABEL_WIDTH_STORAGE_KEY, String(labelWidth));
    }
  }, [labelWidth, tasks, timelineEnd, timelineStart, ready]);

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

  useEffect(() => {
    if (!columnResize) return;
    const handleMove = (event: PointerEvent) => {
      setLabelWidth(
        clampNumber(columnResize.originalWidth + event.clientX - columnResize.startX, MIN_LABEL_WIDTH, MAX_LABEL_WIDTH),
      );
    };
    const handleUp = () => setColumnResize(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [columnResize]);

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

  const resizeColumnByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    setLabelWidth((current) =>
      clampNumber(current + (event.key === "ArrowLeft" ? -step : step), MIN_LABEL_WIDTH, MAX_LABEL_WIDTH),
    );
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

  const exportLongImage = async () => {
    try {
      setNotice("正在生成完整长图…");
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await document.fonts?.ready;

      const imageGroups = TIERS.map((tier) => ({ tier, tasks: tasks.filter((task) => task.tier === tier) })).filter(
        (group) => group.tasks.length,
      );
      const imageMonths = monthSegments(timelineStart, timelineEnd);
      const pageMargin = 40;
      const imageLabelWidth = Math.max(520, labelWidth + 180);
      const trackWidth = Math.max(1100, imageMonths.length * 96);
      const logicalWidth = pageMargin * 2 + imageLabelWidth + trackWidth;
      const measureCanvas = document.createElement("canvas");
      const measureContext = measureCanvas.getContext("2d");
      if (!measureContext) throw new Error("canvas-unavailable");

      const labelTextWidth = imageLabelWidth - 82;
      const rowLayouts = new Map<string, { title: string[]; detail: string[]; height: number }>();
      for (const task of tasks) {
        measureContext.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
        const titleLines = wrapCanvasText(measureContext, task.title || "未命名任务", labelTextWidth);
        measureContext.font = '400 20px "PingFang SC", "Microsoft YaHei", sans-serif';
        const detailLines = wrapCanvasText(measureContext, task.detail, labelTextWidth);
        const height = Math.max(132, 28 + titleLines.length * 34 + (detailLines.length ? 10 + detailLines.length * 28 : 0) + 48);
        rowLayouts.set(task.id, { title: titleLines, detail: detailLines, height });
      }

      const heroHeight = 190;
      const boardGap = 24;
      const monthHeaderHeight = 82;
      const groupHeaderHeight = 62;
      const emptyHeight = tasks.length ? 0 : 130;
      const rowsHeight = tasks.reduce((sum, task) => sum + (rowLayouts.get(task.id)?.height ?? 108), 0);
      const boardHeight =
        monthHeaderHeight + imageGroups.length * groupHeaderHeight + rowsHeight + emptyHeight + 54;
      const logicalHeight = pageMargin + heroHeight + boardGap + boardHeight + pageMargin;
      const maxDimension = 28000;
      const maxPixels = 150_000_000;
      const renderScale = Math.min(
        1.5,
        maxDimension / logicalWidth,
        maxDimension / logicalHeight,
        Math.sqrt(maxPixels / (logicalWidth * logicalHeight)),
      );

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(logicalWidth * renderScale));
      canvas.height = Math.max(1, Math.floor(logicalHeight * renderScale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas-unavailable");
      context.scale(renderScale, renderScale);
      context.textBaseline = "alphabetic";
      context.fillStyle = "#f4f1ea";
      context.fillRect(0, 0, logicalWidth, logicalHeight);

      roundedCanvasRect(context, pageMargin, pageMargin, logicalWidth - pageMargin * 2, heroHeight, 24);
      context.fillStyle = "#173a5c";
      context.fill();
      context.fillStyle = "rgba(255,255,255,.68)";
      context.font = '700 12px "SFMono-Regular", Menlo, monospace';
      context.fillText("ROADMAP STUDIO", pageMargin + 38, pageMargin + 34);
      context.fillStyle = "#ffffff";
      context.font = '700 50px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText("Roadmap", pageMargin + 38, pageMargin + 102);
      context.fillStyle = "#e9c978";
      context.font = '700 18px "SFMono-Regular", Menlo, monospace';
      context.fillText(
        `${timelineStart.replaceAll("-", ".")} — ${timelineEnd.replaceAll("-", ".")}`,
        pageMargin + 40,
        pageMargin + 137,
      );
      context.fillStyle = "rgba(255,255,255,.78)";
      context.font = '500 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.textAlign = "right";
      context.fillText(
        `${tasks.length} 个任务  ·  ${totalDays} 个累计计划天数  ·  ${diffDays(timelineStart, timelineEnd) + 1} 天时间跨度`,
        logicalWidth - pageMargin - 38,
        pageMargin + 102,
      );
      context.fillStyle = "rgba(255,255,255,.55)";
      context.font = '400 16px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText("完整路线图长图", logicalWidth - pageMargin - 38, pageMargin + 132);
      context.textAlign = "left";

      const boardX = pageMargin;
      const boardY = pageMargin + heroHeight + boardGap;
      const boardWidth = logicalWidth - pageMargin * 2;
      roundedCanvasRect(context, boardX, boardY, boardWidth, boardHeight, 20);
      context.fillStyle = "#fffdf9";
      context.fill();
      context.strokeStyle = "#dfe3e7";
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = "#f7f7f4";
      context.fillRect(boardX, boardY, boardWidth, monthHeaderHeight);
      context.fillStyle = "#182235";
      context.font = '700 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText("任务", boardX + 32, boardY + 35);
      context.fillStyle = "#7d8791";
      context.font = '400 15px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText("名称 · 备注 · 日期", boardX + 32, boardY + 57);

      const timelineX = boardX + imageLabelWidth;
      let monthX = timelineX;
      context.textAlign = "center";
      for (const month of imageMonths) {
        const monthWidth = (month.width / 100) * trackWidth;
        context.strokeStyle = "#dfe3e7";
        context.beginPath();
        context.moveTo(monthX, boardY);
        context.lineTo(monthX, boardY + monthHeaderHeight);
        context.stroke();
        context.fillStyle = "#25354a";
        context.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
        context.fillText(month.label, monthX + monthWidth / 2, boardY + 34);
        if (month.year) {
          context.fillStyle = "#7b8795";
          context.font = '600 14px "SFMono-Regular", Menlo, monospace';
          context.fillText(month.year, monthX + monthWidth / 2, boardY + 55);
        }
        monthX += monthWidth;
      }
      context.textAlign = "left";

      let cursorY = boardY + monthHeaderHeight;
      for (const group of imageGroups) {
        context.fillStyle = "#eef2f4";
        context.fillRect(boardX, cursorY, boardWidth, groupHeaderHeight);
        context.fillStyle = "#718093";
        context.font = '700 13px "SFMono-Regular", Menlo, monospace';
        context.fillText(TIER_META[group.tier].eyebrow, boardX + 32, cursorY + 25);
        context.fillStyle = "#182235";
        context.font = '700 19px "PingFang SC", "Microsoft YaHei", sans-serif';
        context.fillText(group.tier, boardX + 150, cursorY + 27);
        context.fillStyle = "#718093";
        context.font = '400 16px "PingFang SC", "Microsoft YaHei", sans-serif';
        context.fillText(TIER_META[group.tier].description, boardX + 252, cursorY + 27);
        cursorY += groupHeaderHeight;

        for (const task of group.tasks) {
          const layout = rowLayouts.get(task.id) ?? { title: [task.title], detail: [], height: 108 };
          const rowTop = cursorY;
          const rowBottom = rowTop + layout.height;
          context.strokeStyle = "#ebe9e3";
          context.beginPath();
          context.moveTo(boardX, rowBottom);
          context.lineTo(boardX + boardWidth, rowBottom);
          context.stroke();

          context.fillStyle = task.color;
          context.beginPath();
          context.arc(boardX + 36, rowTop + 34, 6, 0, Math.PI * 2);
          context.fill();
          let textY = rowTop + 34;
          context.fillStyle = "#182235";
          context.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
          for (const line of layout.title) {
            context.fillText(line, boardX + 58, textY);
            textY += 34;
          }
          if (layout.detail.length) {
            textY += 3;
            context.fillStyle = "#647084";
            context.font = '400 20px "PingFang SC", "Microsoft YaHei", sans-serif';
            for (const line of layout.detail) {
              context.fillText(line, boardX + 58, textY);
              textY += 28;
            }
          }
          context.fillStyle = "#7d8791";
          context.font = '500 17px "PingFang SC", "Microsoft YaHei", sans-serif';
          context.fillText(`${formatDate(task.start)} — ${formatDate(task.end)}`, boardX + 58, rowBottom - 17);

          let gridX = timelineX;
          for (const month of imageMonths) {
            const monthWidth = (month.width / 100) * trackWidth;
            context.strokeStyle = "#ebe9e3";
            context.beginPath();
            context.moveTo(gridX, rowTop);
            context.lineTo(gridX, rowBottom);
            context.stroke();
            gridX += monthWidth;
          }

          const total = diffDays(timelineStart, addDays(timelineEnd, 1));
          const barX = timelineX + (diffDays(timelineStart, task.start) / total) * trackWidth;
          const barWidth = Math.max(10, ((diffDays(task.start, task.end) + 1) / total) * trackWidth);
          const barHeight = 54;
          const barY = rowTop + (layout.height - barHeight) / 2;
          roundedCanvasRect(context, barX, barY, barWidth, barHeight, 9);
          context.fillStyle = task.color;
          context.fill();
          if (barWidth > 70) {
            context.save();
            context.beginPath();
            context.rect(barX + 12, barY, Math.max(0, barWidth - 24), barHeight);
            context.clip();
            context.fillStyle = "#ffffff";
            context.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
            context.fillText(fitCanvasText(context, task.title, barWidth - 24), barX + 12, barY + 27);
            context.restore();
          }
          cursorY = rowBottom;
        }
      }

      if (!tasks.length) {
        context.fillStyle = "#647084";
        context.font = '500 22px "PingFang SC", "Microsoft YaHei", sans-serif';
        context.textAlign = "center";
        context.fillText("当前 Roadmap 还没有任务", boardX + boardWidth / 2, cursorY + 72);
        context.textAlign = "left";
        cursorY += emptyHeight;
      }

      context.fillStyle = "#8a929d";
      context.font = '400 15px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText("Roadmap Studio · 图片根据时间跨度与任务内容自动展开", boardX + 32, boardY + boardHeight - 22);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("image-export-failed"))), "image/png");
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `roadmap-long-${new Date().toISOString().slice(0, 10)}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`长图已导出（${canvas.width} × ${canvas.height}）。`);
    } catch {
      setNotice("长图生成失败，请缩短时间范围后重试。");
    }
  };

  const importTasks = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (isRoadmapExport(parsed)) {
        setTimelineStart(parsed.range.start);
        setTimelineEnd(parsed.range.end);
        setTasks(migrateSampleColors(fitTasksToRange(parsed.tasks, parsed.range.start, parsed.range.end)));
        setNotice(`已导入时间范围和 ${parsed.tasks.length} 个任务。`);
      } else if (isTaskArray(parsed)) {
        setTasks(migrateSampleColors(fitTasksToRange(parsed, timelineStart, timelineEnd)));
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
            <h1>Roadmap</h1>
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
            <button onClick={exportTasks}>导出 JSON</button>
            <button onClick={exportLongImage}>导出长图</button>
            <input ref={fileInput} type="file" accept="application/json" onChange={importTasks} hidden />
          </div>
        </div>

        <div className="timeline-scroll">
          <div className="timeline-board" style={boardStyle}>
            <div className="timeline-header timeline-grid">
              <div className="task-heading">
                <span>任务</span>
                <small>点击编辑 · 拖动右侧分隔线调列宽</small>
                <button
                  type="button"
                  className={`column-resizer ${columnResize ? "active" : ""}`}
                  aria-label="调整任务名称列宽"
                  aria-valuemin={MIN_LABEL_WIDTH}
                  aria-valuemax={MAX_LABEL_WIDTH}
                  aria-valuenow={Math.round(labelWidth)}
                  title="拖动调整任务名称列宽；方向键可微调"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setColumnResize({ startX: event.clientX, originalWidth: labelWidth });
                  }}
                  onKeyDown={resizeColumnByKeyboard}
                />
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
                <select value={editing.tier} onChange={(event) => {
                  const tier = event.target.value as Tier;
                  setEditing({ ...editing, tier, color: TIER_DEFAULT_COLOR[tier] });
                }}>
                  {TIERS.map((tier) => <option key={tier}>{tier}</option>)}
                </select>
              </label>
              <fieldset className="color-field">
                <legend>任务颜色</legend>
                <div>{COLORS.map((color) => <button type="button" key={color} className={editing.color === color ? "selected" : ""} style={{ background: color }} aria-label={`选择颜色 ${color}`} onClick={() => setEditing({ ...editing, color })} />)}</div>
                <p className="color-hint">切换层级时会自动使用默认色，也可以在这里重新选择。</p>
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
