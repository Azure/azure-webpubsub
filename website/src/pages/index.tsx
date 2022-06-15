import React from 'react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

import Demos from '@site/src/components/Demos'
import CustomerStories from '../components/CustomerStories'
import Feedback from '../components/Feedback'
import Banner from '../components/Banner'
import Layout from '@theme/Layout'
import Introduction, { IntroductionProps } from '../components/Introduction'

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  const introProps: IntroductionProps = { hidden: true, title: '', description: '', liveDemoLink: '' }

  return (
    <Layout title={siteConfig.title}>
      <Banner></Banner>
      <Introduction {...introProps}></Introduction>
      <Demos hidden={false}></Demos>
      <CustomerStories></CustomerStories>
      <Feedback></Feedback>
    </Layout>
  )
}
