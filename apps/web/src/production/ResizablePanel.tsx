import { useCallback, useRef, type ReactNode } from "react";

import {

  ChevronLeft,

  ChevronRight,

  GripHorizontal,

  GripVertical,

} from "lucide-react";



type Axis = "x" | "y";

interface Props {

  axis: Axis;

  size: number;

  min: number;

  max: number;

  collapsed?: boolean;

  onResize: (size: number) => void;

  onToggleCollapse?: () => void;

  collapseSide: "start" | "end";

  label: string;

  children: ReactNode;

  className?: string;

  /** Hide the built-in title bar (e.g. when the child renders its own header). */

  hideHeader?: boolean;

}



function CollapseIcon({

  axis,

  collapseSide,

}: {

  axis: Axis;

  collapseSide: "start" | "end";

}) {

  if (axis === "y") return <GripHorizontal size={14} />;

  return collapseSide === "start" ? (

    <ChevronLeft size={14} />

  ) : (

    <ChevronRight size={14} />

  );

}



export function ResizablePanel({

  axis,

  size,

  min,

  max,

  collapsed,

  onResize,

  onToggleCollapse,

  collapseSide,

  label,

  children,

  className,

  hideHeader,

}: Props) {

  const dragging = useRef(false),

    start = useRef(0),

    origin = useRef(size),

    panelRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(

    (event: React.PointerEvent) => {

      if (collapsed) return;

      dragging.current = true;

      start.current = axis === "x" ? event.clientX : event.clientY;

      origin.current = size;

      (event.target as HTMLElement).setPointerCapture(event.pointerId);

    },

    [axis, collapsed, size],

  );

  const onPointerMove = useCallback(

    (event: React.PointerEvent) => {

      if (!dragging.current) return;

      const delta =

          (axis === "x" ? event.clientX : event.clientY) - start.current,

        signed = collapseSide === "start" ? delta : -delta;

      onResize(Math.min(max, Math.max(min, origin.current + signed)));

    },

    [axis, collapseSide, max, min, onResize],

  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {

    dragging.current = false;

    (event.target as HTMLElement).releasePointerCapture(event.pointerId);

  }, []);



  if (collapsed) {

    const ExpandIcon =

      axis === "x"

        ? collapseSide === "start"

          ? ChevronRight

          : ChevronLeft

        : GripHorizontal;

    return (

      <div

        ref={panelRef}

        className={`panel-collapsed panel-collapsed-${collapseSide} ${className || ""}`}

      >

        <button

          className="panel-expand"

          type="button"

          aria-label={`Показать ${label}`}

          onClick={onToggleCollapse}

        >

          <ExpandIcon size={16} />

          <span className="panel-expand-label">{label}</span>

        </button>

      </div>

    );

  }



  const style =

    axis === "x" ? { width: size, flexShrink: 0 as const } : { height: size };



  const resizeHandle = (

    <div

      className={`resize-handle ${collapseSide}`}

      role="separator"

      aria-orientation={axis === "x" ? "vertical" : "horizontal"}

      aria-label={`Изменить размер: ${label}`}

      onPointerDown={onPointerDown}

      onPointerMove={onPointerMove}

      onPointerUp={onPointerUp}

    >

      <div className="resize-handle-tools">

        {axis === "x" ? (

          <GripVertical size={16} />

        ) : (

          <GripHorizontal size={16} />

        )}

        {onToggleCollapse && (

          <button

            type="button"

            className="panel-collapse"

            aria-label={`Скрыть ${label}`}

            onClick={onToggleCollapse}

          >

            <CollapseIcon axis={axis} collapseSide={collapseSide} />

          </button>

        )}

      </div>

    </div>

  );



  const content = (

    <div className="panel-column">

      {!hideHeader && (

        <div className="panel-header">

          <span className="panel-title">{label}</span>

          {onToggleCollapse && (

            <button

              type="button"

              className="panel-header-collapse"

              aria-label={`Скрыть ${label}`}

              onClick={onToggleCollapse}

            >

              <CollapseIcon axis={axis} collapseSide={collapseSide} />

            </button>

          )}

        </div>

      )}

      <div className="panel-body">{children}</div>

    </div>

  );



  return (

    <div

      ref={panelRef}

      className={`resizable-panel ${axis === "x" ? "panel-x" : "panel-y"} ${className || ""}`}

      style={style}

    >

      {axis === "x" && collapseSide === "end" ? (

        <>

          {resizeHandle}

          {content}

        </>

      ) : (

        <>

          {content}

          {resizeHandle}

        </>

      )}

    </div>

  );

}

