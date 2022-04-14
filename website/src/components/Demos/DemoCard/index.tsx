import React from 'react'
import {
  DocumentCard,
  DocumentCardPreview,
  DocumentCardTitle,
  IDocumentCardPreviewProps,
  DocumentCardLocation,
  Link,
  Separator,
  FontIcon,
  PrimaryButton,
  Stack,
  StackItem,
  ImageFit,
} from '@fluentui/react'
import * as styles from './styles.module'

const previewProps: IDocumentCardPreviewProps = {
  previewImages: [
    {
      name: 'Scoreboard',
      linkProps: {
        href: '#',
        target: '_blank',
      },
      previewImageSrc: '/img/card-scoreboard.png',
      imageFit: ImageFit.cover,
    },
  ],
}

export default function DemoCard(): JSX.Element {
  return (
    <DocumentCard aria-label="Demo card" onClickHref="#" styles={styles.card}>
      <DocumentCardPreview {...previewProps} />
      <DocumentCardLocation location={'Scoreboard'} ariaLabel="Scoreboard" />
      <DocumentCardTitle title={'A scoreboard live demo to show to monitor real time matches'} styles={styles.title} />
      <DocumentCardTitle title={'Is this recommendation helpful?'} shouldTruncate showAsSecondaryTitle />
      <Separator></Separator>
      <Stack horizontal horizontalAlign="space-between" styles={styles.footer}>
        <StackItem style={styles.footerItem}>
          <Stack horizontal horizontalAlign="space-between">
            <PrimaryButton text="Try demo" allowDisabledFocus />
            <Link styles={styles.link}>See details</Link>
          </Stack>
        </StackItem>
        <StackItem style={styles.footerItem}>
          <FontIcon aria-label="Share" iconName="Share" className={styles.classNames.share} />
        </StackItem>
      </Stack>
    </DocumentCard>
  )
}
