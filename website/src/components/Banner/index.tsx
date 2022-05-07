import React from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, Navigation } from 'swiper'
import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/navigation'

import styles from './styles.module.css'
import { IsWideDevice } from '@site/src/utils/CssUtils'

export default function Banner() {
  const isWide = IsWideDevice()
  const imageSource = `/img/banner-${isWide ? 'desktop' : 'mobile'}-1.png`
  return (
    <Swiper
      slidesPerView={1}
      spaceBetween={30}
      loop={true}
      pagination={{
        clickable: true,
      }}
      navigation={isWide}
      modules={[Pagination, Navigation]}
    >
      <SwiperSlide>
        <img src={imageSource} className={styles.bannerImage}></img>
      </SwiperSlide>
      <SwiperSlide>
        <img src={imageSource} className={styles.bannerImage}></img>
      </SwiperSlide>
    </Swiper>
  )
}
