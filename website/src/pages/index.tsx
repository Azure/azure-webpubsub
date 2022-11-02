import React from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'

import Carousel from '../components/Carousel/Carousel'
import Tagline from '../components/HomePage/Tagline'
import DemoCards from '../components/HomePage/DemoCards'
import Footer from '../components/Common/Footer'

export default function Home() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <div>
      <div id="cookie-banner"></div>
      <Layout title={`${siteConfig.title}`} description="Description will go into a meta tag in <head />">
        <div className="w-screen overflow-hidden">
          <Carousel />
          <Tagline />

          <div className="mb-10 flex justify-center">
            <DemoCards />
          </div>

          <Footer />
        </div>
      </Layout>
    </div>
  )
}
