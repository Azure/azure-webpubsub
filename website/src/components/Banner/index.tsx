import React from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, Navigation } from 'swiper'
import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/navigation'

import styles from './styles.module.css'
import { IsWideDevice } from '@site/src/utils/CssUtils'

export default function Banner() {
  const isWide = IsWideDevice()
  const { siteConfig } = useDocusaurusContext()
  const bannerImageSources = siteConfig.customFields.bannerImageSources
  const sources = isWide ? bannerImageSources.desktop : bannerImageSources.mobile
  const bannerImageSourcesAriaLabels = siteConfig.customFields.bannerImageSourcesAriaLabels
  const ariaLabels = isWide ? bannerImageSourcesAriaLabels.desktop : bannerImageSourcesAriaLabels.mobile
  const slides = sources.map((src: string, i: number) => (
    <SwiperSlide key={i}>
      <img src={src} className={styles.bannerImage} aria-label={ariaLabels[i]}></img>
    </SwiperSlide>
  ))
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
      {slides}
    </Swiper>
  )
}
