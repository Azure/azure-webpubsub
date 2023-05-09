import React from 'react'

function CarouselSlide({ title, description, imageSrc }) {
  return (
    <div className="relative w-full">
      <section className="absolute top-2 left-5 md:top-44 lg:top-56 xl:top-80">
        <h1 className="max-w-[90%] py-7 text-3xl font-bold text-gray-50 drop-shadow-md md:ml-10 md:max-w-[70%] md:text-5xl lg:ml-14 lg:max-w-[60%] xl:text-6xl">
          {title}
        </h1>
        <p className="max-w-3xl text-gray-200 md:ml-10 md:block md:max-w-[70%] lg:ml-14">{description}</p>
      </section>
      <img src={imageSrc} className="h-[340px] w-full object-cover md:h-[600px] xl:h-[750px]" aria-label={description} alt={description} />
    </div>
  )
}

export default CarouselSlide
