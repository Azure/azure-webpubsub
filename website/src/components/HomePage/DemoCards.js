import React from 'react'

import { DataDemos } from '../../DataDemos'
import DemoCard from '@site/src/components/HomePage/DemoCard'

function DemoCards() {
  return (
    <section className="mt-4 ">
      <h2 className="py-5 text-center text-2xl font-bold">Explore demos</h2>
      <div className="flex  justify-center">
        <div className="max-w-[90%] gap-y-2 gap-x-6 md:grid md:grid-cols-2 lg:grid-cols-3 xl:max-w-7xl xl:grid-cols-4">
          {DataDemos.map(item => (
            <DemoCard
              title={item.title}
              description={item.description}
              imgURL={item.thumbnailURL}
              detailURL={item.detailURL}
              languages={item.languages}
              key={item.id}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default DemoCards
