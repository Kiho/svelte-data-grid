<script>
  import { afterUpdate, createEventDispatcher, onMount } from 'svelte';

  // [svelte-upgrade suggestion]
  // manually refactor all references to __this
  const __this = {};

  const dispatch = createEventDispatcher();

  export let wrapper;
  export let tableSpace = null;

  import EditHistory from './edit-history';
  import * as deepDiff from 'deep-diff';

  const MIN_COLUMN_SIZE = 30;

  /**
   * Computes the 'left' value for a grid-cell.
   * @param {Number} i The cell index
   * @param {Array} columnWidths The array of column widths in order
   * @returns {Number}
   */
  function getCellLeft({i, columnWidths, __affixedColumnIndices, __scrollLeft}) {
    if (__affixedColumnIndices.indexOf(i) >= 0) {
      if (i === 0) {
        return __scrollLeft;
      }
      let left = __scrollLeft;
      for (let j = i-1; j >= 0; j--) {
        left += columnWidths[j];
      }
      return left;
    }

    let left = 0;
    for (let j = 0; j < i; j++) {
      left += columnWidths[j];
    }
    return left;
  }

  /**
   * Gets the closest column index given an x offset
   * @param {Number} x The x offset
   * @param {Array} columnWidths Array of column widths
   * @param {Array} __affixedColumnIndices Array of column indices that have been affixed
   * @param {Number} __scrollLeft The scrollLeft value of the scrollable container
   * @returns {Number}
   */ 
  function getClosestIndex(x, columnWidths, __affixedColumnIndices, __scrollLeft) {
    let closest = 0;
    
    for (let i = 0; i < columnWidths.length; i++) {
      const left = getCellLeft({i, columnWidths, __affixedColumnIndices, __scrollLeft}) + Math.floor(columnWidths[i] / 2);
      
      if (left < x) {
        closest = i+1;
      }
    }

    // special handling required when there are affixed columns, because
    // if the grid is scrolled horizontally to the right, we want to have this function return the closest
    // affixed column, rather than any columns that might be closer to x but are being overlapped by an affixed column
    if (__affixedColumnIndices.length > 0) {
      const firstAffixedLeft = getCellLeft({i: __affixedColumnIndices[0], columnWidths, __affixedColumnIndices, __scrollLeft});
      const lastAffixedLeft = getCellLeft({i: __affixedColumnIndices[__affixedColumnIndices.length-1], columnWidths, __affixedColumnIndices, __scrollLeft});
      const lastAffixedRight = lastAffixedLeft + columnWidths[__affixedColumnIndices[__affixedColumnIndices.length-1]];
      const closestLeft = getCellLeft({i: closest, columnWidths, __affixedColumnIndices, __scrollLeft});
      if (closestLeft > firstAffixedLeft && closestLeft < lastAffixedRight) {
        if (closestLeft < lastAffixedRight && closestLeft > lastAffixedLeft) {
          closest = __affixedColumnIndices[__affixedColumnIndices.length-1];
        } else {
          for (let i = 0; i < __affixedColumnIndices.length; i++) {
            const left = getCellLeft({i: __affixedColumnIndices[i], columnWidths, __affixedColumnIndices, __scrollLeft}) + Math.floor(columnWidths[__affixedColumnIndices[i]]/2);

            if (left < x) {
              closest = __affixedColumnIndices[i] + 1;
            }
          }
        }
      }
    }

    return closest;
  }

  function getBodyScrollTop() {
    return window.pageYOffset || (document.documentElement.clientHeight ? document.documentElement.scrollTop : document.body.scrollTop);
  }

  export let __scrollLeft = 0;
  export let __affixedColumnIndices = [];
  export let columns = [];
  export let rows = [];
  export let __resizing = false;
  export let __scrolledAllTheWayToTheRight = false;
  export let rowHeight = 24;
  export let __innerOffsetHeight = 0;
  export let __scrollTop = 0;
  export let __extraRows = 0;
  export let __columnDragging = false;
  export let __affixingColumn = false;
  export let __columnActionLineLeft = 0;
  export let __affixingRow = false;
  export let __rowActionLineTop = 0;
  export let i;
  export let allowColumnReordering = true;
  export let allowResizeFromTableHeaders = true;
  export let __columnHeaderResizeCaptureWidth = 20;
  export let allowColumnAffix = true;
  export let allowResizeFromTableCells = false;
  export let __affixedRowIndices = [];
  export let __rowAffixLineTop = 0;
  export let __columnAffixLineLeft = 0;
  export let __columnIndexBeingDragged = null;
  export let __columnDragOffsetX = 0;
  export let __columnIndexBeingResized = null;
  export let columnWidths;

  onMount(() => {
    __this.editHistory = new EditHistory(rows);
  });

  let prevRows;
  // [svelte-upgrade warning]
  // beforeUpdate and afterUpdate handlers behave
  // differently to their v2 counterparts
  afterUpdate(() => {
    // Record the change in onupdate to allow the DOM to change before doing the deep diff
    if (prevRows !== rows && prevRows && prevRows.length > 0) {
      if (!current.skipRecord) {
        __this.editHistory.recordChange(rows);
      } else {
        skipRecord = false;
      }
    }
    prevRows = rows;    
  });

  function dragCopy(node, enabled) {
    let copy = null;
    let dragging = false;
    let offsetX = 0;

    function onWindowMouseMove(event) {
      if (!dragging) {
        return;
      }
      copy.style.left = (event.pageX - offsetX) + 'px';
    }

    function onWindowMouseUp(event) {
      if (!dragging || event.which !== 1) {
        return;
      }

      dragging = false;
      document.body.removeChild(copy);
      copy = null;
    }

    function onNodeMouseDown(event) {
      if (event.which !== 1) {
        return;
      }

      dragging = true;
      if (copy) {
        document.body.removeChild(copy);
      }

      copy = createCopy();
      offsetX = event.offsetX;
      copy.style.top = (node.getBoundingClientRect().top + getBodyScrollTop()) + 'px';
      copy.style.left = (event.pageX - offsetX) + 'px';
      document.body.appendChild(copy);
    }

    function createCopy() {
      const copy = document.createElement('div');
      copy.innerHTML = node.innerHTML;
      const { width, height, textAlign, fontWeight } = getComputedStyle(node);
      copy.style.width = width;
      copy.style.height = height;
      copy.style.maxHeight = height;
      copy.style.textAlign = textAlign;
      copy.style.fontWeight = fontWeight;
      copy.style.position = 'absolute';
      copy.style.opacity = '0.5';
      copy.style.pointerEvents = 'none';
      copy.style.overflow = 'hidden';
      copy.style.background = '#dddddd';
      copy.style['z-index'] = '99999';

      return copy;
    }

    function attachEvents() {
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      node.addEventListener('mousedown', onNodeMouseDown);
    }

    function detachEvents() {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      node.removeEventListener('mousedown', onNodeMouseDown);
    }
    if (enabled) {
      attachEvents();
    }

    return {
      destroy() {
        detachEvents();
      },
      update(enabled) {
        if (enabled) {
          attachEvents();
        } else {
          detachEvents();
        }
      }
    }
  }

  // [svelte-upgrade suggestion]
  // review these functions and remove unnecessary 'export' keywords
  export function onWindowKeyDown(event) {
    if (event.ctrlKey) {

      if (event.keyCode === 90) {
        undo();
        event.preventDefault();
      }

      if (event.keyCode === 89) {
        redo();
        event.preventDefault();
      }
    }
  }

  export function onMouseMove(event) {
    onColumnDragMouseMove(event);
    onColumnResizeMouseMove(event);
    onRowAffixMouseMove(event);
    onColumnAffixMouseMove(event);
  }

  export function onMouseUp(event) {
    onColumnDragEnd(event);
    onColumnResizeEnd(event);
    onRowAffixEnd(event);
    onColumnAffixEnd(event);
  }

  export function onCellUpdated(event) {
    rows[event.rowNumber][event.column.dataName] = event.value;

    rows = rows;
    dispatch('valueUpdated', event);
  }

  export function undo() {
    const rows = __this.editHistory.undo();
    if (rows) {
      rows = rows, skipRecord = true;
    }
  }

  export function redo() {
    const rows = __this.editHistory.redo();
    if (rows) {
      rows = rows, skipRecord = true;
    }
  }

  export function onColumnAffixStart(event) {
    // left click only
    if (event.which !== 1) {
      return;
    }
    if (__affixedColumnIndices.length > 0) {
      tableSpace.scrollLeft = 0;
      __affixingColumn = true;
    } else {
      __affixingColumn = true;
    }    
  }

  export function onColumnAffixMouseMove(event) {
    if (!__affixingColumn) {
      return;
    }

    if (event.which !== 1) {
      onColumnAffixEnd(event);
      return;
    }

    const { left: wrapperPageX } = wrapper.getBoundingClientRect();

    const offsetPoint = event.pageX - wrapperPageX + __scrollLeft;
    
    const idx = getClosestIndex(offsetPoint, columnWidths, __affixedColumnIndices, __scrollLeft);
    const indices = [];
    for (let i = 0; i < idx; i++) {
      indices.push(i);
    }

    __columnActionLineLeft = offsetPoint, __affixedColumnIndices = indices;
    
    event.preventDefault();
    
    // check to see if horizontal scroll position doesn't match where the 
  }

  export function onColumnAffixEnd(event) {
    __affixingColumn = false;
  }

  export function onRowAffixStart(event) {
    __affixingRow = true;
  }

  export function onRowAffixMouseMove(event) {
    if (!__affixingRow) {
      return;
    }
  }

  export function onRowAffixEnd(event) {
    __affixingRow = false;
  }

  export function onColumnDragStart(event, columnIndex) {
    if (event.which !== 1) {
      return;
    }
    
    // if the developer has disabled column reordering, don't begin a reorder
    if (!allowColumnReordering) {
      return;
    }

    __columnDragging = true, __columnIndexBeingDragged = columnIndex, __columnDragOffsetX = event.offsetX, __columnActionLineLeft = getCellLeft({i: columnIndex, columnWidths, __scrollLeft, __affixedColumnIndices}) - __scrollLeft;
  }

  export function onColumnDragMouseMove(event) {
    if (!__columnDragging) {
      return;
    }

    // if user is no longer pressing the left mouse button and we are out of sync
    // with __columnDragging because mouseup didn't fire, finish the reorder
    if (event.which !== 1) {
      onColumnDragEnd(event);
      return;
    }


    const { left: wrapperPageX } = wrapper.getBoundingClientRect();

    // change the position of the action line to the closest column index under the mouse
    const offsetPoint = event.pageX - wrapperPageX + __scrollLeft - __columnDragOffsetX;
    const idx = getClosestIndex(offsetPoint, columnWidths, __affixedColumnIndices, __scrollLeft);
    
    __columnActionLineLeft = getCellLeft({i: idx, columnWidths, __affixedColumnIndices, __scrollLeft}) - __scrollLeft;
  }

  export function onColumnDragEnd(event) {

    // user might try to be clever and middle-click to scroll horizontally while dragging a column
    // don't stop the drag for middle clicks
    if (event.which !== 1) {
      return;
    }

    // if a column isn't being dragged, don't reorder anything
    if (!__columnDragging) {
      return;
    }

    const { left: wrapperPageX } = wrapper.getBoundingClientRect();
    const offsetPoint = event.pageX - wrapperPageX + __scrollLeft - __columnDragOffsetX;

    // move column object to its new position in the array based off the mouse position and scroll position
    const newIdx = getClosestIndex(offsetPoint, columnWidths, __affixedColumnIndices, __scrollLeft);
    columns.splice(newIdx > __columnIndexBeingDragged ? newIdx - 1 : newIdx, 0, columns.splice(__columnIndexBeingDragged, 1)[0]);
    
    // delay firing of event so that new column order is accessible when handlers are called
    setTimeout(() => dispatch('columnOrderUpdated'), 0);

    __columnDragging = false, columns = columns, __columnDragOffsetX = 0, __columnIndexBeingDragged = null;
  }

  export function onColumnResizeStart(event, columnIndex) {
    // left click only
    if (event.which !== 1) {
      return;
    }
    const { left: wrapperPageX } = wrapper.getBoundingClientRect();

    __resizing = true, __columnActionLineLeft = event.pageX - wrapperPageX - __scrollLeft, __columnIndexBeingResized = columnIndex;

    event.stopPropagation();
  }

  export function onColumnResizeMouseMove(event) {

    // if not currently resizing a column, ignore the event
    if (!__resizing) {
      return;
    }

    const { left: wrapperPageX } = wrapper.getBoundingClientRect();

    const resizeLineLeft = event.pageX - wrapperPageX;
    const columnLeft = getCellLeft({i: __columnIndexBeingResized, columnWidths, __affixedColumnIndices, __scrollLeft});
    const resizeLineMinLeft = columnLeft - __scrollLeft + MIN_COLUMN_SIZE;
    const newColumnWidth = Math.max((resizeLineLeft + __scrollLeft) - columnLeft, MIN_COLUMN_SIZE);
    // thanks to the virtual list, we're able to get away with setting the column's size while the mouse moves
    columns[__columnIndexBeingResized].width = newColumnWidth;

    const obj = {
      __columnActionLineLeft: Math.max(resizeLineLeft, resizeLineMinLeft),
      columns
    };
    
    // If mouseup was not fired for some reason, abort the resize
    if (event.which !== 1) {        
      obj.__resizing = false;
      obj.__columnIndexBeingResized = null;

      // delay firing the event until the next frame to guarantee that new values will be available in component.get()
      setTimeout(() => dispatch('columnWidthUpdated', {
        idx: __columnIndexBeingResized,
        width: newColumnWidth
      }), 0);
    }
    
    // this.set(obj);
    __columnActionLineLeft = obj.__columnActionLineLeft;
    __resizing = obj.__resizing;
    __columnIndexBeingResized = obj.__columnIndexBeingResized;
    columns = obj.columns;
    // if still resizing and the user does not have the left mouse button depressed,
    // the mouseup event didn't fire for some reason, so turn off the resize mode    
  }

  export function onColumnResizeEnd(event) {
    if (!__resizing) {
      return;
    }
    
    dispatch('columnWidthUpdated');
    __resizing = false, __columnIndexBeingResized = null;
  }

  export function onScroll() {
    // const obj = {};
    // get current saved scroll values

    // get new scroll values from the scroll area
    const { scrollTop: newScrollTop, scrollLeft: newScrollLeft } = tableSpace;

    /* 
    * To avoid doing unnecessary re-calculation of computed variables, don't set the scroll
    * properties that haven't changed
    */
    // if (__scrollTop !== newScrollTop) {
    //   obj.__scrollTop = newScrollTop;
    // }

    // if (__scrollLeft !== newScrollLeft) {
    //   obj.__scrollLeft = newScrollLeft;
    // }

    // obj.__scrolledAllTheWayToTheRight = Math.ceil(tableSpace.scrollWidth - tableSpace.scrollLeft) === tableSpace.clientWidth;

    // this.set(obj);

    if (__scrollTop !== newScrollTop) {
      __scrollTop = newScrollTop;
    }

    if (__scrollLeft !== newScrollLeft) {
      __scrollLeft = newScrollLeft;
    }
    __scrolledAllTheWayToTheRight = Math.ceil(tableSpace.scrollWidth - tableSpace.scrollLeft) === tableSpace.clientWidth;
  }

  export let columnAffixLineLeft;
  $: {
    // if no columns are affixed, set the line all the way to the left
    if (__affixedColumnIndices.length === 0) {
      columnAffixLineLeft = 0;
    }

    let left = __scrollLeft;
    for (let i = 0; i < __affixedColumnIndices.length; i++) {
      left += columnWidths[__affixedColumnIndices[i]];
    }

    columnAffixLineLeft = left;
    // return left;
  }

  // export let columnWidths;
  $: {
    // if width was not provided for this column, give it a default value
    columnWidths = columns.map(x => x.width || MIN_COLUMN_SIZE);
  }

  export let numRows;
  $: {
    numRows = rows.length;
  }

  export let gridSpaceWidth;
  $: {
    let sum = 0;
    for (let i = 0; i < columnWidths.length; i++) {
      sum += columnWidths[i];
    }

    /**
     * If the table is scrolled all the way to the right, resizing columns could
     * accelerate until the column is the minimum width. Add some extra space on the right
     * to ensure this undesired behavior does not happen. This doesn't seem like a perfect solution
     * but it works for now until I can think of something better.
     */ 
    if (__resizing && __scrolledAllTheWayToTheRight) {
      sum *= 2;
    }

    gridSpaceWidth = sum;
  }

  export let gridSpaceHeight;
  $: {
    gridSpaceHeight = rowHeight * numRows;
  }

  export let numRowsInViewport;
  $: {
    numRowsInViewport = Math.ceil(__innerOffsetHeight / rowHeight);
  }

  export let visibleRows;
  $: {
    const start = Math.max(0, Math.floor((__scrollTop / rowHeight) - (__extraRows / 2)));
    const end = start + numRowsInViewport + __extraRows;

    visibleRows = rows.slice(start, end).map((x, i) => {
      return {
        i: i + start, // for aria-rowindex
        data: x       // the row data
      };
    });
  }

  function getCellZIndex(__affixedColumnIndices, i) {
    return __affixedColumnIndices.indexOf(i) === -1 ? 1 : 2;
  }

  function getRowTop(i, rowHeight) {
    return i * rowHeight;
  }
</script>

<svelte:window on:mouseup="{onMouseUp}" on:mousemove="{onMouseMove}" on:keydown="{onWindowKeyDown}" />
<div class="data-grid-wrapper { __resizing || __columnDragging ? 'resizing' : '' }" style="padding-top: {rowHeight}px;" bind:this={wrapper} role="table">
  {#if __resizing || __columnDragging || __affixingColumn}
    <div class="column-action-line" style="left: {__columnActionLineLeft - 2}px;"></div>
  {/if}
  {#if __affixingRow}
    <div class="row-action-line" style="top: {__rowActionLineTop - 2}px;"></div>
  {/if}

  <div class="grid-headers" style="height: {rowHeight}px;" rolw="rowgroup">
    <!-- We link up the horizontal scrolling of the inner grid view with the sticky header row by making the
      -- header row width 100% of the container, and using position:absolute along with 'left' to
      -- control the 'scroll' of the header row -->
    <div class="grid-header-row" style="left: -{__scrollLeft}px; height: {rowHeight}px; width: {gridSpaceWidth}px;" role="row">
      {#each columns as column, i (i)}
        <div class="grid-cell" on:mousedown="{event => onColumnDragStart(event, i)}" style="z-index: {getCellZIndex(__affixedColumnIndices, i)}; left: {getCellLeft({i, columnWidths, __affixedColumnIndices, __scrollLeft})}px; width: {columnWidths[i]}px; height: {rowHeight}px; line-height: {rowHeight}px;" title={column.display || ''} use:dragCopy="{allowColumnReordering}" role="columnheader">
          {#if column.headerComponent}
            <svelte:component this={column.headerComponent} column={column} />
          {:else}
            <div class="cell-default">
              {column.display || ''}
            </div>
          {/if}
        </div>
        {#if allowResizeFromTableHeaders && !column.disallowResize}
          <div class="grid-cell-size-capture" style="left: {getCellLeft({i: i, columnWidths, __affixedColumnIndices, __scrollLeft}) + columnWidths[i] - Math.floor(__columnHeaderResizeCaptureWidth / 2)}px; width: {__columnHeaderResizeCaptureWidth}px;" on:mousedown="{event => onColumnResizeStart(event, i)}"></div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="grid-inner" bind:this={tableSpace} bind:offsetHeight="{__innerOffsetHeight}" on:scroll="{onScroll}" style="height: 100%;" role="rowgroup">

    {#if allowColumnAffix}
      <div class="column-affix-marker" style="left: {columnAffixLineLeft}px; height: {gridSpaceHeight}px;" on:mousedown="{onColumnAffixStart}"></div>
    {/if}
    <!--<div class="row-affix-marker" style="top: {__rowAffixLineTop}px; width: {gridSpaceWidth}px;" on:mousedown="onRowAffixStart(event)"></div>-->

    <!-- We need an element to take up space so our scrollbars appear-->
    <div class="grid-space" style="width: {gridSpaceWidth}px; height: {gridSpaceHeight}px;">
      {#if allowResizeFromTableCells}
        {#each columns as column, i}
          {#if !column.disallowResize}
            <div class="grid-cell-size-capture" style="left: {getCellLeft({i: i+1, columnWidths, __affixedColumnIndices, __scrollLeft}) - Math.floor(__columnHeaderResizeCaptureWidth / 2)}px; width: {__columnHeaderResizeCaptureWidth}px;" on:mousedown="{event => onColumnResizeStart(event, i)}"></div>
          {/if}
        {/each}
      {/if}
    </div>
    
    
    <!-- Loop through the visible rows and display the data-->
    <!-- Scrolling seems to perform better when not using a keyed each block -->
    {#each visibleRows as row, i}
      <div class="grid-row" style="top: {getRowTop(row.i, rowHeight)}px; height: {rowHeight}px; width: {gridSpaceWidth}px;" role="row" aria-rowindex="{row.i}">
        {#each columns as column, j}
          <div class="grid-cell" style="z-index: {getCellZIndex(__affixedColumnIndices, j)}; left: {getCellLeft({i: j, columnWidths, __affixedColumnIndices, __scrollLeft})}px; height: {rowHeight}px; line-height: {rowHeight}px; width: {columnWidths[j]}px;" role="cell">
            {#if column.cellComponent}
              <svelte:component this={column.cellComponent} rowNumber={row.i} column={column} row={row} on:valueupdate="{onCellUpdated}" />
            {:else}
              <div class="cell-default">
                {row.data[column.dataName] || ''}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .row-action-line {
    position: absolute;
    left: 0;
    width: 100%;
    height: 4px;
    z-index: 6;
    background: #aaa;
  }

  .row-affix-marker {
    display: none;
    position: absolute;
    left: 0;
    height: 4px;
    z-index: 6;
    background: white;
    border-top: 1px solid #999;
    border-bottom: 1px solid #999;

    cursor: ns-resize;
  }

  .column-affix-marker {
    position: absolute;
    top: 0;
    width: 4px;
    z-index: 5;
    background: white;
    border-left: 1px solid #999;
    border-right: 1px solid #999;
    cursor: ew-resize;
    transform: translateX(-50%);
  }

  .resizing * {
    user-select: none;
  }

  .resizing .grid-inner {
    overflow-y: hidden;
  }

  .resizing .grid-space {
    pointer-events: all;
  }

  .grid-cell > * {
    height: 100%;
  }

  .cell-default {
    padding: 0 5px;
    background: white;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-grid-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .column-action-line {
    position: absolute;
    top: 0;
    bottom: 17px;
    z-index: 3;
    width: 4px;
    background: #aaa;
    cursor: ew-resize;
  }

  .grid-cell-size-capture {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 5;
    background: transparent;
    cursor: ew-resize;
    pointer-events: all;
  }

  .grid-inner {
    overflow: auto;
  }

  .grid-space {
    position: absolute;
    top: 0;
    left: 0;
    background: transparent;
    pointer-events: none;

    z-index: 3;
  }

  .grid-headers {
    position: absolute;
    overflow: hidden;
    max-width: 100%;
    width: 100%;
    top: 0;
    left: 0;
    border-bottom: 2px solid black;
  }

  .grid-headers .grid-cell {
    text-align: center;
    font-weight: bold;
    cursor: pointer;
  }

  .grid-headers .cell-default:hover {
    background: #eee;
  }

  .grid-header-row {
    position: absolute;
    overflow: hidden;
    top: 0;
  }

  .grid-row {
    position: absolute;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .grid-row:not(:last-child) {
    border-bottom: 1px solid #666;
  }

  .grid-cell {
    position: absolute;
    top: 0;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .grid-cell > * {
    width: 100%;
  }

  .grid-cell:not(:last-child) {
    border-right: 1px solid #666;
  }
</style>
