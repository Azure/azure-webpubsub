import React from 'react'
import { initializeIcons } from '@fluentui/font-icons-mdl2'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

import NavBar from '@site/src/components/NavBar'
import Demos from '@site/src/components/Demos'
import CustomerStories from '../components/CustomerStories'
import Feedback from '../components/Feedback'
import Banner from '../components/Banner'

initializeIcons()

export default function Home(): JSX.Element {
  return (
    <div>
      <NavBar></NavBar>
      <Banner></Banner>
      <Demos></Demos>
      <CustomerStories></CustomerStories>
      <Feedback></Feedback>
    </div>
  )
}
