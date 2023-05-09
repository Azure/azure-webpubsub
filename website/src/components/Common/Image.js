import React from 'react'

function Image({ imgURL, ariaInfo = "an image" }) {
  return (
    <div className="overflow-hidden pr-2 pb-2">
          <img src={imgURL} className="block w-[95%] rounded-2xl border border-gray-100 p-2 shadow-sm" aria-label={ariaInfo} />
    </div>
  )
}

export default Image
