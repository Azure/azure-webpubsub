import React from 'react'

import ChevronLeft from '@site/static/icons/chevron_left.svg'
import ChevronRight from '@site/static/icons/chevron_right.svg'

function ButtonNav({ direction, onClick, isShow, ariaLabel }) {
  return (
    <button tab="true"
        className={`${isShow
            ? '**bg-gray-50-300 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-50 opacity-90 hover:opacity-100 active:bg-gray-200**'
            : 'opacity-0'
            }`}
        onClick={onClick} tabIndex='0' aria-label={ariaLabel} style={{ padding: '4px', fontSize: '12px' }}
    >
      {direction === 'left' ? <ChevronLeft /> : <ChevronRight />}
    </button>
  )
}

export default ButtonNav
