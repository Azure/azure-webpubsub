import React from 'react'
import { FontIcon, Image, ImageFit, Label, Stack, StackItem } from '@fluentui/react'
import * as styles from './styles.module'

export default function Feedback(): JSX.Element {
  return (
    <Stack horizontal styles={styles.centerAlignItems}>
      <StackItem>
        <Image alt="feedback" imageFit={ImageFit.cover} src="/img/feedback.png" width={'6rem'} styles={styles.image}></Image>
      </StackItem>
      <StackItem>
        <Stack>
          <Label styles={styles.title}>No demos you want to see</Label>
          <Label styles={styles.know}>Let us know what demos you want to try</Label>
          <StackItem>
            <Stack horizontal styles={styles.centerAlignItems} tokens={styles.tokens}>
              <Label styles={styles.tellus}>Tell us</Label>
              <FontIcon aria-label="ChevronRight" iconName="ChevronRight" />
            </Stack>
          </StackItem>
        </Stack>
      </StackItem>
    </Stack>
  )
}
