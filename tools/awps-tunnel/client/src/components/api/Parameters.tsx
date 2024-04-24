import React, {useEffect, useState} from "react";
import Card from "react-bootstrap/Card";
import {Form, Table} from "react-bootstrap";
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import Collapse from 'react-bootstrap/Collapse';
import ReactJson from 'react-json-view'
import {Parameter} from "../../models";
import 'bootstrap/dist/css/bootstrap.min.css';
import {Label} from "@fluentui/react-components";
import restapiSpec from '../api/restapiSample.json'
import Button from "react-bootstrap/Button";

export function Parameters(): React.JSX.Element {
	const [collapse, setCollapse] = useState(false);
	const sampleParameter = {
		"filter": "filter1",
		"groups": [
			"groupA", "groupB"
		]
	};
	
	return (
		<Card style={{margin: 5, width: "80%"}}>
			<Card.Header style={{display: "flex", justifyContent: "start"}}
			             onClick={() => setCollapse(!collapse)}><b>Request</b></Card.Header>
			<Collapse in={collapse}>
				<div>
					<Tabs defaultActiveKey="schema">
						<Tab eventKey="schema" title="Schema">
							<Card.Body>
								<div style={{display: "flex", justifyContent: "start"}}>PATH PARAMETER</div>
								<Table>
									<tbody>
									<tr>
										<td>
											<b>
												endpoint
											</b>
											<div style={{fontSize: 10, color: "red"}}>required</div>
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div>string</div>
											<div>HTTP or HTTPS endpoint for the Web PubSub service instance.</div>
										</td>
									</tr>
									<tr>
										<td>
											<b>
												hub
											</b>
											<div style={{fontSize: 10, color: "red"}}>required</div>
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div style={{display: "flex", alignItems: "center"}}>
												<div>string</div>
												<code style={{
													fontSize: 10,
													marginLeft: 10,
													backgroundColor: "#f8f8f8",
													color: "black"
												}}>{`^[A-Za-z][A-Za-z0-9_\`,.[\\]]{0,127}$`}</code>
											</div>
											<div>Target hub name, which should start with alphabetic characters and only
												contain
												alpha-numeric characters or underscore.
											</div>
										</td>
									</tr>
									</tbody>
								</Table>
								<div style={{display: "flex", justifyContent: "start"}}>QUERY PARAMETER</div>
								<Table>
									<tbody>
									<tr>
										<td>
											<b>
												api-version
											</b>
											<div style={{fontSize: 10, color: "red"}}>required</div>
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div style={{display: "flex", alignItems: "center"}}>
												<div>string</div>
											</div>
											<div>The version of the REST APIs.</div>
										</td>
									</tr>
									</tbody>
								</Table>
								<div style={{display: "flex", justifyContent: "start"}}>REQUEST BODY SCHEMA:
									application/json
								</div>
								<Table>
									<tbody>
									<tr>
										<td>
											<b>
												filter
											</b>
											<div style={{fontSize: 10, color: "red"}}>required</div>
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div style={{display: "flex", alignItems: "center"}}>
												<div>string</div>
											</div>
											<div>An OData filter which target connections satisfy</div>
										</td>
									</tr>
									<tr>
										<td>
											<b>
												groups
											</b>
											<div style={{fontSize: 10, color: "red"}}>required</div>
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div style={{display: "flex", alignItems: "center"}}>
												<div>Array of strings</div>
											</div>
											<div>A list of groups which target connections will be added into</div>
										</td>
									</tr>
									</tbody>
								</Table>
							</Card.Body>
						</Tab>
						<Tab eventKey="sample" title="Sample">
							<Card.Body>
								<ReactJson src={sampleParameter} style={{display: "flex", justifyContent: "start"}}
								           name={"body"}/>
							</Card.Body>
						</Tab>
					</Tabs>
				</div>
			
			</Collapse>
		</Card>
	)
}

function renderParameter(parameters: Parameter[], inputTag: React.JSX.Element): React.JSX.Element {
	return (
		<div>{parameters.map((p, key) => {
			return (
				<div key={key}>
					<div style={{display: "flex"}}>
						<Form.Label style={{fontSize: 18, marginRight: 10}}>{p.name}</Form.Label>
						{p.required && <Form.Label style={{color: "red"}}>required</Form.Label>}
					</div>
					{/*<Form.Control value={restapiSpec.info.version} readOnly={true}></Form.Control>*/}
					{inputTag}
					{p.description && <Form.Text>{p.description}</Form.Text>}
				</div>
			)
		})}</div>
	)
}

export function TryItParameters({parameters}: { parameters: Parameter[] }): React.JSX.Element {
	const queryParameters: Parameter[] = parameters.filter(p => p.in === "query");
	const headerParameters: Parameter[] = parameters.filter(p => p.in === "header");
	const pathParameters: Parameter[] = parameters.filter(p => p.in === "path");
	const formDataParameters: Parameter[] = parameters.filter(p => p.in === "formData");
	const bodyParameters: Parameter[] = parameters.filter(p => p.in === "body");
	// console.log(queryParameters);
	// console.log(bodyParameters);
	return (
		<Card style={{margin: 5, width: "95%"}}>
			<Card.Header style={{display: "flex", justifyContent: "start"}}>Parameters</Card.Header>
			<Card.Body style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
				{headerParameters.length > 0 &&
          <div style={{margin: 10}}>
            <Label><b style={{fontSize: 20}}>Header</b></Label>
          </div>}
				{queryParameters.length > 0 &&
          <div style={{margin: 10}}>
            <Label><b style={{fontSize: 20}}>Query</b></Label>
						{renderParameter(queryParameters, <Form.Control value={restapiSpec.info.version}
						                                                readOnly={true}></Form.Control>)}
          </div>}
				{pathParameters.length > 0 &&
          <div style={{margin: 10}}>
            <Label><b style={{fontSize: 20}}>Path</b></Label>
						{renderParameter(pathParameters, <Form.Control value={`hub name`} readOnly={true}></Form.Control>)}
          </div>}
				{formDataParameters.length > 0 &&
          <div style={{margin: 10}}>
            <Label><b style={{fontSize: 20}}>Form Data</b></Label>
          </div>}
				{bodyParameters.length > 0 &&
          <div style={{margin: 10}}>
            <Label><b style={{fontSize: 20}}>Body</b></Label>
						{renderParameter(bodyParameters, <Form.Control value={``} readOnly={true}></Form.Control>)}
          </div>}
				<div style={{display: "flex", justifyContent: "end", width: "100%"}}>
					<Button style={{width: "20%"}}>Send</Button>
				</div>
			</Card.Body>
		</Card>
	)
}
