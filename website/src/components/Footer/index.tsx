import React, {useState, useEffect} from 'react'
import { IStackTokens, Link, Stack } from "@fluentui/react";
import styles from './styles.module.css'

export default function Footer(): JSX.Element {
    const tokens:IStackTokens = {
        childrenGap: '20px'
    }

    const [visible, setVisible] = useState(true)
    useEffect(() => {
        setVisible(window.siteConsent.isConsentRequired)
    })

    return (
        <Stack className={styles.footer} horizontal horizontalAlign='end' tokens={tokens}>
            {visible && <Link className={styles.item} onClick={() => {window.siteConsent.manageConsent()}}>Manage Cookies</Link>}
            <Link className={styles.item} href="https://go.microsoft.com/fwlink/?LinkId=521839" target="_blank">Privacy</Link>
            <span className={styles.item}>© Microsoft 2022</span>
        </Stack>
    )
}
