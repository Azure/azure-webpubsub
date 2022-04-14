import React from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, Navigation } from 'swiper'
import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/navigation'

import styles from './styles.module.css'

export default function Banner() {
  return (
    <Swiper
      slidesPerView={1}
      spaceBetween={30}
      loop={true}
      pagination={{
        clickable: true,
      }}
      navigation={true}
      modules={[Pagination, Navigation]}
    >
      <SwiperSlide>
        <img src="/img/banner1.png" className={styles.bannerImage}></img>
      </SwiperSlide>
      <SwiperSlide>
        <img src="/img/banner1.png" className={styles.bannerImage}></img>
      </SwiperSlide>
    </Swiper>
  )
}
