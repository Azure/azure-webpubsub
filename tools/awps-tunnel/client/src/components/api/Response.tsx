import React, {useEffect, useState} from "react";
import {APIResponse, ResponseSchema} from "../../models";
import {Card, CardHeader, CardPreview, Label, Tab, TabList} from "@fluentui/react-components";
import type {
	SelectTabData,
	SelectTabEvent,
	TabValue,
} from "@fluentui/react-components";
// @ts-ignore, dependency for library, don't remove
import locale from "react-json-editor-ajrm/locale/en";
import JSONInput from "react-json-editor-ajrm";


export function Response({responseSchema, response}: {
	responseSchema: { [status: string]: ResponseSchema },
	response: APIResponse | undefined
}): React.JSX.Element {
	const [selectedStatus, setSelectedStatus] = useState<TabValue>();
	useEffect(() => {
		console.log(response);
	}, [response]);
	const onTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
		setSelectedStatus(data.value);
	};
	return (
		<div style={{display: "flex"}}>
			<div style={{flex: 3}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 20}}>Response</b>}/>
					{response &&
			  <CardPreview style={{display: "flex", flexDirection: "column", alignItems: "start", padding: 15}}>
								{response && (response.status.toString()[0] === "2" ?
										<Label style={{color: "green"}}>{response.status}</Label> :
										<Label style={{color: "red"}}>{response.status} {response.code}</Label>
								)}
				  <JSONInput locale={locale} placeholder={response}
				             colors={{
										           default: "black",
										           background: "white",
										           keys: "#8b1853",
										           string: "#4a50a3",
										           colon: "black"
									           }} height={"auto"} viewOnly={true} confirmGood={false}/>
			  </CardPreview>}
				</Card>
			</div>
			<div style={{flex: 1}}>
				<Card style={{margin: 5, width: "95%"}}>
					<CardHeader header={<b style={{fontSize: 15}}>Response Schema</b>}/>
					<CardPreview>
						<TabList style={{display: "flex"}} selectedValue={selectedStatus} onTabSelect={onTabSelect}>
							{Object.entries(responseSchema).map(([status], key) => (
								<Tab id={status} value={status} key={key}>
									<div style={{color: status[0] === "2" ? 'green' : 'red'}}>{status}</div>
								</Tab>
							))}
						</TabList>
						{Object.entries(responseSchema).map(([status, response]) => (
							status === selectedStatus && <div style={{margin: 10}}>{response.description}</div>
						))}
					</CardPreview>
				</Card>
			</div>
		</div>
	)
}
