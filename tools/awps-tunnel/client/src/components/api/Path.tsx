import {PathItem} from "../../models";
import {POST} from "./Methods";

export function Path({pathItem, path}: { pathItem: PathItem, path: string }): React.JSX.Element {
	return (<div style={{flex:5}}>
		<div>
			{pathItem.post && <POST post={pathItem.post} path={path}/>}
		</div>
	
	</div>)
}
