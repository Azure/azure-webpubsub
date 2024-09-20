import type {
    SelectTabData,
    SelectTabEvent,
    TabValue,
} from "@fluentui/react-components";
import { Card, CardHeader, CardPreview, Label, Tab, TabList } from "@fluentui/react-components";
import React, { useEffect, useState } from "react";
import { ResponseSchema } from "../../models";
import { Editor } from "@monaco-editor/react";
import { ApiResponse } from "./Parameters";

export var jsonColor =
{
    default: "black",
    background: "white",
    keys: "#8b1853",
    string: "#4a50a3",
    colon: "black"
}

function getFirstOrDefaultKey<T>(record: Record<string, T>): string | undefined {
    if (!record) return undefined;
    const keys = Object.keys(record);
    return keys.length > 0 ? keys[0] : undefined;
}

export function Response({ responseSchema, response }: {
    responseSchema: { [status: string]: ResponseSchema },
    response: ApiResponse | undefined
}): React.JSX.Element {
    const [selectedStatus, setSelectedStatus] = useState<TabValue>(getFirstOrDefaultKey(responseSchema));
    useEffect(() => {
        setSelectedStatus(getFirstOrDefaultKey(responseSchema));
    }, [responseSchema]);
    const onTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
        setSelectedStatus(data.value);
    };
    return (
        <div className="d-flex">
            <div style={{ flex: 3 }}>
                <Card className="m-2 w-95">
                    <CardHeader header={<b className="fs-6">Response</b>} />
                    {!response && <CardPreview className="d-flex flex-column align-items-start p-3">
                        <div>Invoke the API to see the Response</div></CardPreview>}

                    {response &&
                        <CardPreview className="d-flex flex-column align-items-start p-3">
                            <Label className={response.ok ? "text-success" : "text-danger"}>
                                {response.status}
                            </Label>
                            {response.body &&
                                <Editor
                                    height={"10vh"}
                                    defaultLanguage={response.isJson ? "json" : undefined}
                                    options={
                                        {
                                            lineNumbers: "off",
                                            folding: false,
                                            minimap: {
                                                enabled: false
                                            }
                                        }}
                                    value={response.body} />
                            }

                        </CardPreview>}
                </Card>
            </div>
            <div style={{ flex: 1 }}>
                <Card className="m-2 w-95">
                    <CardHeader header={<b className="fs-6">Response Schema</b>} />
                    {responseSchema && <CardPreview>
                        <TabList className="d-flex" selectedValue={selectedStatus} onTabSelect={onTabSelect}>
                            {Object.entries(responseSchema).map(([status], key) => (
                                <Tab id={status} value={status} key={key}>
                                    <div className={status[0] === "2" ? "text-success" : "text-danger"}>{status}</div>
                                </Tab>
                            ))}
                        </TabList>
                        {Object.entries(responseSchema).map(([status, response]) => (
                            status === selectedStatus && <div key={status} style={{ margin: 10 }}>{response.description}</div>
                        ))}
                    </CardPreview>}
                </Card>
            </div>
        </div>
    )
}
