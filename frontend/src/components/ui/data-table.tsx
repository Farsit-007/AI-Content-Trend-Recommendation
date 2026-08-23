import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableSkeleton } from "@/components/ui/table-skeleton"

/** Extra per-column knobs. v9 resolves this through the `columnMeta` type slot below. */
export type DataTableColumnMeta = {
  /** Applied to both the header and the body cells of the column. */
  className?: string
  /** Human label for the column-visibility menu, when the header is not a plain string. */
  label?: string
}

/**
 * One feature registration shared by every dashboard table. v9 requires features
 * to be declared up front — sorting/filtering/pagination state and APIs do not
 * exist until they are registered here. Declared at module scope because a new
 * `features`, `columns`, or `data` reference invalidates the row models.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnVisibilityFeature,
  rowSelectionFeature,
  columnMeta: {} as DataTableColumnMeta,
})

export type DataTableFeatures = typeof dataTableFeatures
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData>
export type DataTableRow<TData extends RowData> = Row<DataTableFeatures, TData>

/** Typed column helper bound to the shared feature set. */
export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>()
}

/** A stable empty array — a fresh `[]` fallback each render would rebuild every row model. */
const EMPTY_ROWS: never[] = []
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100]

export type DataTableServerPagination = {
  /** 1-based, matching the backend `page` query param and the `meta.page` envelope. */
  page: number
  pageSize: number
  /** `meta.total` — needed for last-page and next-page availability. */
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

export type DataTableSearch = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /**
   * "server" means the caller refetches on change, so the table must not also
   * filter the page it was handed.
   */
  mode?: "client" | "server"
}

export type DataTableProps<TData extends RowData> = {
  data: TData[] | undefined
  columns: DataTableColumn<TData>[]
  getRowId?: (row: TData, index: number) => string
  isLoading?: boolean
  isFetching?: boolean
  error?: unknown
  onRetry?: () => void
  search?: DataTableSearch
  /** Filters, view switches, and primary actions rendered in the toolbar. */
  toolbar?: React.ReactNode
  /** Enables row selection; receives the selected rows and a way to clear them. */
  bulkActions?: (args: { rows: TData[]; clear: () => void }) => React.ReactNode
  /** Server-paginated tables pass this; omit it for client-side pagination. */
  serverPagination?: DataTableServerPagination
  pageSize?: number
  pageSizeOptions?: number[]
  /** Hides the footer entirely for short, fully-loaded tables. */
  hidePagination?: boolean
  enableColumnVisibility?: boolean
  emptyState?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
  /** Tables do not shrink to 375px, so below `md` each row renders as a card. */
  renderMobileCard?: (row: TData) => React.ReactNode
  onRowClick?: (row: TData) => void
  /** Minimum table width before the container scrolls horizontally. */
  minWidth?: number
  className?: string
}

/** Selection column, ready to prepend to a column list. */
export function selectionColumn<TData extends RowData>(): DataTableColumn<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    meta: { className: "w-0", label: "Select" },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        onClick={(event) => event.stopPropagation()}
      />
    ),
  }
}

function columnLabel(column: {
  id: string
  columnDef: { header?: unknown; meta?: DataTableColumnMeta }
}): string {
  if (column.columnDef.meta?.label) return column.columnDef.meta.label
  if (typeof column.columnDef.header === "string") return column.columnDef.header
  return column.id
}

export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  search,
  toolbar,
  bulkActions,
  serverPagination,
  pageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  hidePagination = false,
  enableColumnVisibility = true,
  emptyState,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  renderMobileCard,
  onRowClick,
  minWidth = 720,
  className,
}: DataTableProps<TData>) {
  const isMobile = useIsMobile()
  const rows = data ?? EMPTY_ROWS

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [clientPagination, setClientPagination] = React.useState({ pageIndex: 0, pageSize })

  const serverSearch = search?.mode === "server"
  const globalFilter = search && !serverSearch ? search.value : ""

  const pagination = serverPagination
    ? { pageIndex: Math.max(0, serverPagination.page - 1), pageSize: serverPagination.pageSize }
    : clientPagination

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId,
    state: { sorting, columnVisibility, rowSelection, pagination, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater
      if (serverPagination) {
        if (next.pageSize !== serverPagination.pageSize) {
          serverPagination.onPageSizeChange?.(next.pageSize)
        }
        if (next.pageIndex !== pagination.pageIndex) {
          serverPagination.onPageChange(next.pageIndex + 1)
        }
        return
      }
      setClientPagination(next)
    },
    onGlobalFilterChange: (updater) => {
      if (!search || serverSearch) return
      const next = typeof updater === "function" ? updater(globalFilter) : updater
      search.onChange(String(next ?? ""))
    },
    globalFilterFn: "includesString",
    // The server already filtered and paged the rows it handed us; filtering or
    // slicing them again here would hide rows that legitimately belong on the page.
    manualFiltering: serverSearch,
    manualPagination: Boolean(serverPagination),
    rowCount: serverPagination?.total,
    enableRowSelection: Boolean(bulkActions),
    enableSortingRemoval: false,
  })

  const selectedRows = bulkActions
    ? table.getSelectedRowModel().rows.map((row) => row.original)
    : []
  const clearSelection = React.useCallback(() => setRowSelection({}), [])

  const leafColumns = table.getAllLeafColumns()
  const hideableColumns = leafColumns.filter((column) => column.getCanHide())
  const bodyRows = table.getRowModel().rows

  const totalRows = serverPagination?.total ?? table.getRowCount()
  const pageCount = table.getPageCount()
  const showPagination = !hidePagination && (pageCount > 1 || Boolean(serverPagination))
  const hasToolbar = Boolean(
    search || toolbar || (enableColumnVisibility && hideableColumns.length > 1)
  )

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)}>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder ?? "Search"}
                className="h-9 pl-8"
                aria-label={search.placeholder ?? "Search"}
              />
              {search.value && (
                <button
                  type="button"
                  onClick={() => search.onChange("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {toolbar}
          {enableColumnVisibility && hideableColumns.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto gap-2">
                  <SettingsIcon />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {columnLabel(column)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {bulkActions && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-surface px-3 py-2">
          <span className="text-sm font-medium text-brand">{selectedRows.length} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions({ rows: selectedRows, clear: clearSelection })}
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border",
          isFetching && !isLoading && "opacity-70 transition-opacity"
        )}
      >
        {isLoading ? (
          <TableSkeleton rows={5} columns={Math.min(leafColumns.length || 4, 6)} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : bodyRows.length === 0 ? (
          (emptyState ?? <EmptyState title={emptyTitle} description={emptyDescription} />)
        ) : isMobile && renderMobileCard ? (
          <div className="flex flex-col divide-y divide-border/60 dark:divide-white/5">
            {bodyRows.map((row) => (
              <div
                key={row.id}
                className={cn("p-4", onRowClick && "cursor-pointer hover:bg-accent/40")}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {renderMobileCard(row.original)}
              </div>
            ))}
          </div>
        ) : (
          <Table style={{ minWidth }}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta
                    const canSort = header.column.getCanSort()
                    const sorted = canSort ? header.column.getIsSorted() : false
                    return (
                      <TableHead key={header.id} className={meta?.className}>
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="-mx-1.5 flex items-center gap-1 rounded-sm px-1.5 py-1 uppercase transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <table.FlexRender header={header} />
                            {sorted === "asc" ? (
                              <ArrowUpIcon className="size-3" />
                            ) : sorted === "desc" ? (
                              <ArrowDownIcon className="size-3" />
                            ) : (
                              <ChevronsUpDownIcon className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {bodyRows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {showPagination && !isLoading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {totalRows > 0
              ? `${totalRows.toLocaleString()} ${totalRows === 1 ? "row" : "rows"}`
              : "No rows"}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[110px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="px-1 text-xs whitespace-nowrap text-muted-foreground">
              Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="First page"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                onClick={() => table.setPageIndex(pagination.pageIndex - 1)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                onClick={() => table.setPageIndex(pagination.pageIndex + 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Last page"
                onClick={() => table.setPageIndex(Math.max(pageCount - 1, 0))}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
