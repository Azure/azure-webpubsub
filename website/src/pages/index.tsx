import React from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

import Demos from '@site/src/components/Demos'
import CustomerStories from '../components/CustomerStories'
import Feedback from '../components/Feedback'
import Banner from '../components/Banner'
import Layout from '@theme/Layout'
import styles from './index.module.css'
import { Stack } from '@fluentui/react'
import Footer from '../components/Footer'

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()

  return (
    <div>
      <div id="cookie-banner"></div>
      <Layout title={siteConfig.title}>
        <Banner></Banner>
        <Stack horizontal horizontalAlign="center">
          <section className={styles.mainContent}>
            {/* <Demos></Demos> */}
            <CustomerStories></CustomerStories>
            <Feedback></Feedback>
          </section>
        </Stack>
      </Layout>
      <Footer></Footer>
    </div>
  )
}
