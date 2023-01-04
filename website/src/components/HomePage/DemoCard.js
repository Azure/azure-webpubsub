import React from 'react'
import useBaseUrl from '@docusaurus/useBaseUrl'

import CodePercent from '@site/src/components/Common/CodePercent'
import ButtonLink from '@site/src/components/Common/ButtonLink'

function DemoCard({ title, description, imgURL, detailURL, languages }) {
  let firstTwoLanguages = languages.slice(0, 2)

  return (
    <div className="relative mb-5 w-full overflow-hidden rounded-xl shadow-lg">
      <img src={useBaseUrl(imgURL)} className="h-52 w-full object-cover" alt={description} aria-label={description}/>
          
      <section className="h-44 px-4 pt-3 pb-6">
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-1 mb-5 text-sm leading-5 text-gray-500">{description}</p>

        <div className="absolute bottom-4">
          <ButtonLink text="View details" to={detailURL} />
        </div>
      </section>
    </div>
  )
}

export default DemoCard
