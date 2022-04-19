import React from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

import Demos from '@site/src/components/Demos'
import CustomerStories from '../components/CustomerStories'
import Feedback from '../components/Feedback'
import Banner from '../components/Banner'
import Layout from '@theme/Layout'

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()

  return (
    <Layout title={siteConfig.title}>
      <Banner></Banner>
      <Demos></Demos>
      <CustomerStories></CustomerStories>
      <Feedback></Feedback>
    </Layout>
  )
}
