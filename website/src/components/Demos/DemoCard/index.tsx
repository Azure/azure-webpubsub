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

export interface DemoCardProps {
  name: string,
  title: string,
  target: string,
}

export default function DemoCard(props: DemoCardProps): JSX.Element {
  return (
    <DocumentCard aria-label={props.name} onClickHref="#">
      <DocumentCardPreview {...previewProps} />
      <DocumentCardLocation location={props.name} ariaLabel={props.name} />
      <DocumentCardTitle title={props.title} styles={styles.title} />
      <DocumentCardTitle title={'Is this recommendation helpful?'} shouldTruncate showAsSecondaryTitle />
      <Separator></Separator>
      <Stack horizontal horizontalAlign="space-between" styles={styles.footer}>
        <StackItem style={styles.footerItem}>
          <Stack horizontal horizontalAlign="space-between">
            <PrimaryButton text="Try demo" allowDisabledFocus />
            <Link styles={styles.link} target={props.target}>See details</Link>
          </Stack>
        </StackItem>
        <StackItem style={styles.footerItem}>
          <FontIcon aria-label="Share" iconName="Share" className={styles.classNames.share} />
        </StackItem>
      </Stack>
    </DocumentCard>
  )
}
