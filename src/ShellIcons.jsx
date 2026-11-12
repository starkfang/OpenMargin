import React from 'react';
import {
  ArrowDownIcon, ArrowUpIcon, ChatBubbleIcon, ChevronDownIcon, ChevronRightIcon,
  ClockIcon, Cross2Icon, FilePlusIcon, FrameIcon, HamburgerMenuIcon, MagnifyingGlassIcon,
  MinusIcon, Pencil1Icon, PlusIcon, ReloadIcon, TextIcon,
} from '@radix-ui/react-icons';

// The icons are decorative: the enclosing control supplies the accessible name.
// Fixed Radix-native geometry keeps desktop toolbar controls aligned without a tile.
const icon = Component => function ShellIcon({ className, ...props }) {
  return <Component {...props} className={className} width={15} height={15} aria-hidden="true" focusable="false" style={{ flex: 'none', verticalAlign: 'middle', ...props.style }} />;
};

export const OpenIcon = icon(PlusIcon);
// Radix Icons has no floppy-disk glyph. Match its 15px grid, 1px weight,
// currentColor and half-pixel alignment instead of mixing in another icon set.
const FloppyDiskIcon = props => <svg viewBox="0 0 15 15" fill="none" {...props}>
  <path d="M3 1.5h7.5l3 3V12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12V3A1.5 1.5 0 0 1 3 1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M4.5 1.5v4h5v-4M4.5 13.5V9a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v4.5" stroke="currentColor" strokeLinejoin="round"/>
</svg>;
export const SaveIcon = icon(FloppyDiskIcon);
export const SaveAsIcon = icon(FilePlusIcon);
export const ZoomInIcon = icon(PlusIcon);
export const ZoomOutIcon = icon(MinusIcon);
export const OutlineIcon = icon(HamburgerMenuIcon);
export const AnnotationIcon = icon(TextIcon);
export const AreaIcon = icon(FrameIcon);
export const EditIcon = icon(Pencil1Icon);
export const ExpandIcon = icon(ChevronDownIcon);
export const CollapseIcon = icon(ChevronRightIcon);
export const HistoryIcon = icon(ClockIcon);
export const RefreshIcon = icon(ReloadIcon);
export const SearchIcon = icon(MagnifyingGlassIcon);
export const CommentsIcon = icon(ChatBubbleIcon);
export const PreviousIcon = icon(ArrowUpIcon);
export const NextIcon = icon(ArrowDownIcon);
export const CloseIcon = icon(Cross2Icon);
