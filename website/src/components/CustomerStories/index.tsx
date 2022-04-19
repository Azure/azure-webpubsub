import React from 'react'
import { Stack, StackItem, Label } from '@fluentui/react'
import * as styles from './styles.module'
import Story from './Story'
import { IsWideDevice } from '@site/src/utils/CssUtils'

export default function CustomerStories(): JSX.Element {
  const isWide = IsWideDevice()
  return (
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
}
