import React, { useState } from 'react'
import './style.css'

import hero_stock from '@site/static/img/hero/hero_stock.jpg'
import hero_chat from '@site/static/img/hero/hero_chat.jpg'
import hero_serverless from '@site/static/img/hero/hero_serverless.jpg'
import hero_connected_devices from '@site/static/img/hero/hero_connected_devices.jpg'

import CarouselSlide from './CarouselSlide'
import ButtonNav from './ButtonNav'
import CarouselDots from './CarouselDots'

const DATA_SLIDES = [
  {
    id: 1,
    title: 'Push time-sensitive data to your clients at cloud scale',
    description:
      "Traditional real-time features require clients sending repeated requests to a server even when there's no new data. Azure Web PubSub builds on WebSocket that allows you push data as soon as it's available from the server.",
    img: hero_stock,
  },
  {
    id: 2,
    title: 'Build real-time chat apps that connect users across the globe',
    description: 'Azure Web PubSub provides rich APIs for different messaging patterns that allow you to create direct chat and group chat experiences.',
    img: hero_chat,
  },
  {
    id: 3,
    title: 'Focus on your users, not infrastructure',
    description:
      'Managing WebSocket connections at scale is not for the faint of heart. Azure Web PubSub allows you to focus on delivering features that bring differentiating values and not worrying about whether your app server can keep up.',
    img: hero_serverless,
  },
  {
    id: 4,
    title: 'Monitor and synchronize internet-connected devices with high reliability',
    description: '',
    img: hero_connected_devices,
  },
]

export default function Carousel() {
  const [slideIndex, setSlideIndex] = useState(0)

  const SLIDE_NUM = DATA_SLIDES.length

  // Classname follows this template carousel_slide_{}_{}
  const OffsetX_Classname = `carousel_slide_${slideIndex + 1}_${SLIDE_NUM}`

  const nextSlide = () => {
    if (DATA_SLIDES.length !== slideIndex + 1) {
      setSlideIndex(slideIndex => slideIndex + 1)
    }
  }

  const prevSlide = () => {
    if (slideIndex !== 0) {
      setSlideIndex(slideIndex => slideIndex - 1)
    }
  }

  return (
    <div className="relative h-[270px] w-screen md:h-[600px] xl:h-[750px]">
      <div className="absolute bottom-1/2 z-50 flex w-full translate-y-1/2 transform justify-between px-4">
        <ButtonNav direction="left" onClick={prevSlide} isShow={slideIndex !== 0} />
        <ButtonNav direction="right" onClick={nextSlide} isShow={slideIndex !== SLIDE_NUM - 1} />
      </div>

      <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 transform gap-1">
        <CarouselDots number={SLIDE_NUM} currentIndex={slideIndex} />
      </div>

      <div className={`${OffsetX_Classname} flex w-[calc(100%*4)] duration-500 ease-in-out`}>
        {DATA_SLIDES.map(slide => (
          <CarouselSlide title={slide.title} description={slide.description} imageSrc={slide.img} key={slide.id} />
        ))}
      </div>
    </div>
  )
}
