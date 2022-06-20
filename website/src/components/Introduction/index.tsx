import React from 'react'
import { Image, ImageFit, Label, Stack, StackItem, PrimaryButton } from '@fluentui/react'
import * as styles from './styles.module'
import { IsWideDevice } from '@site/src/utils/CssUtils'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

export interface IntroductionProps {
  previewImageName: string
  title: string
  description: string
  liveDemoLink: string
}

function IntroductionDesktop(props: IntroductionProps): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  return (
    <Stack horizontal wrap reversed styles={styles.background}>
      <Stack grow horizontal horizontalAlign="end" styles={styles.tryDemo}>
        <StackItem styles={styles.tryDemoItem}>
          <div style={styles.content}>
            <Label style={styles.title}>{props.title}</Label>
            <Label>{props.description}</Label>
          </div>
          <PrimaryButton text="Launch demo" href={props.liveDemoLink} target="_blank"></PrimaryButton>
        </StackItem>
      </Stack>
      <Stack grow horizontal horizontalAlign="start">
        <Image
          imageFit={ImageFit.none}
          src={`${siteConfig.baseUrl}img/previews/${props.previewImageName}.jpg`}
          alt="demo introduction"
          style={styles.preview}
        ></Image>
      </Stack>
    </Stack>
  )
}

function IntroductionMobile(props: IntroductionProps): JSX.Element {
  return (
    <Stack>
      <Stack horizontal wrap reversed styles={styles.backgroundMobile}>
        <Stack grow horizontal styles={styles.tryDemo}>
          <StackItem styles={styles.tryDemoItem}>
            <div style={styles.content}>
              <Label style={styles.title}>{props.title}</Label>
              <Label>{props.description}</Label>
            </div>
          </StackItem>
        </Stack>
      </Stack>
      <Stack tokens={styles.mobileButtonTokens}>
        <PrimaryButton text="Launch demo" href={props.liveDemoLink} target="_blank"></PrimaryButton>
      </Stack>
    </Stack>
  )
}

export default function Introduction(props: IntroductionProps): JSX.Element {
  const isWide = IsWideDevice()
  return isWide ? IntroductionDesktop(props) : IntroductionMobile(props)
}
