import React from 'react'

function CarouselSlide({ title, description, imageSrc }) {
  return (
    <div className="relative w-full">
      <section className="absolute top-2 left-5 w-full px-2 md:top-44 lg:top-56 xl:top-80">
        <div className="max-w-[90%] py-3 text-2xl font-bold text-gray-50 drop-shadow-md sm:py-7 sm:text-3xl md:ml-10 md:max-w-[70%] md:text-5xl lg:ml-14 lg:max-w-[60%] xl:text-6xl">
            {title}
        </div>
        <p className="max-w-[90%] text-gray-200 sm:text-sm md:ml-10 md:block md:max-w-[70%] lg:ml-14 lg:text-base">{description}</p>
      </section>
      <img src={imageSrc} className="h-[340px] w-full object-cover md:h-[600px] xl:h-[750px]" aria-label={description} alt={description} />
    </div>
  )
}

export default CarouselSlide
