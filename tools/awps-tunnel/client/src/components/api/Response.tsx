import React, {useState} from "react";
import Card from "react-bootstrap/Card";
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import {Nav, Table} from "react-bootstrap";
import Collapse from "react-bootstrap/Collapse";
import {APIResponse} from "../../models";

export function Response({responses}: { responses: { [status: string]: APIResponse } }): React.JSX.Element {
	// console.log(responses);
	const [collapse, setCollapse] = useState(false);
	
	return (
		<Card style={{margin: 5, width: "95%"}}>
			<Card.Header style={{display: "flex", justifyContent: "start"}}
			             onClick={() => setCollapse(!collapse)}><b>Response</b></Card.Header>
			<Collapse in={collapse}>
				<div>
					<Tabs defaultActiveKey="200">
						<Tab eventKey="200" title="200">
							<Card.Body>
								<div style={{display: "flex", justifyContent: "start"}}>
									RESPONSE SCHEMA: application/json
								</div>
								<Table>
									<tbody>
									<tr>
										<td>
											<b>
												message
											</b>
										
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div>string</div>
											<div>Success message</div>
										</td>
									</tr>
									</tbody>
								</Table>
							</Card.Body>
						</Tab>
						<Tab eventKey="404" title="404">
							<Card.Body>
								<div style={{display: "flex", justifyContent: "start"}}>
									RESPONSE SCHEMA: application/json
								</div>
								<Table>
									<tbody>
									<tr>
										<td>
											<b>
												message
											</b>
										
										</td>
										<td style={{display: "flex", flexDirection: "column", alignItems: "start"}}>
											<div>string</div>
											<div>Error Message</div>
										</td>
									</tr>
									</tbody>
								</Table>
							</Card.Body>
						</Tab>
					</Tabs>
				
				</div>
			
			</Collapse>
		
		</Card>
	)
}
