import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CheckIcon } from '@radix-ui/react-icons';
import { EditIcon, ExpandIcon } from './ShellIcons';

/** Split button: the main action toggles the selected editing mode. */
export default function EditSwitch({ choice, editing, inlineEditing, onToggle, onChoose }) {
  const label = editing ? '返回阅读' : inlineEditing ? '退出原位编辑' : choice === 'inline' ? '原位编辑' : '源码编辑';
  return (
    <div className="edit-switch">
      <button
        type="button"
        className={editing || inlineEditing ? 'active' : ''}
        aria-label={label}
        onClick={onToggle}
      >
        {!(editing || inlineEditing) && <><EditIcon />{' '}</>}{label}
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="edit-switch-arrow" aria-label="选择编辑方式">
            <ExpandIcon />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="radix-edit-menu" sideOffset={4} align="start" collisionPadding={8}>
            <DropdownMenu.RadioGroup value={choice} onValueChange={onChoose}>
              <DropdownMenu.RadioItem className="radix-edit-menu-item" value="inline">
                <DropdownMenu.ItemIndicator className="radix-edit-menu-check"><CheckIcon aria-hidden="true" /></DropdownMenu.ItemIndicator>
                原位编辑
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="radix-edit-menu-item" value="source">
                <DropdownMenu.ItemIndicator className="radix-edit-menu-check"><CheckIcon aria-hidden="true" /></DropdownMenu.ItemIndicator>
                源码编辑
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
