import React, {useState} from "react";
import {APIResponse} from "../../models";
import {Card, CardHeader, CardPreview, Tab, TabList} from "@fluentui/react-components";
import type {
	SelectTabData,
	SelectTabEvent,
	TabValue,
} from "@fluentui/react-components";

export function Response({responses}: { responses: { [status: string]: APIResponse } }): React.JSX.Element {
	const [selectedStatus, setSelectedStatus] = useState<TabValue>();
	const onTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
		setSelectedStatus(data.value);
	};
	return (
		<div style={{display: "flex"}}>
			<div style={{flex: 3}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 20}}>Response</b>}/>
				</Card>
			</div>
			<div style={{flex: 1}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 15}}>Response Schema</b>}/>
					<CardPreview>
						<TabList style={{display: "flex"}} selectedValue={selectedStatus} onTabSelect={onTabSelect}>
							{Object.entries(responses).map(([status], key) => (
								<Tab id={status} value={status} key={key}><div style={{color: status === "200" ? 'green' : 'red'}}>{status}</div></Tab>
							))}
						</TabList>
						{Object.entries(responses).map(([status, response]) => (
							status === selectedStatus && <div style={{margin: 10}}>{response.description}</div>
						))}
					</CardPreview>
				</Card>
			</div>
		</div>
	)
}
