import React from 'react'
import { Stack, StackItem, Label } from '@fluentui/react'
import * as styles from './styles.module'
import Story from './Story'
import { IsWideDevice } from '@site/src/utils/CssUtils'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

export default function CustomerStories(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  const status = siteConfig.customFields.developmentStatus as DevelopmentStatus
  const isWide = IsWideDevice()
  return (
    status.isCustomerStoryReady && (
      <Stack>
        <StackItem>
          <Stack horizontal horizontalAlign="center">
            <StackItem>
              <Label styles={styles.title}>How our customers talk about us</Label>
            </StackItem>
          </Stack>
        </StackItem>
        <StackItem>
          <Stack horizontal={isWide} horizontalAlign="space-around">
            <StackItem>
              <Story></Story>
            </StackItem>
            <StackItem>
              <Story></Story>
            </StackItem>
            <StackItem>
              <Story></Story>
            </StackItem>
          </Stack>
        </StackItem>
      </Stack>
    )
  )
}
