import React, { Component } from 'react';
import { ListGroup, ListGroupItem, Panel } from 'react-bootstrap';

// import i18next translate function, adds t to props
import { translate } from 'react-i18next';

// react-router
// import { browserHistory } from 'react-router';

class Keys extends Component {
	buildList(keys, options) {
		const { t } = this.props;

		console.log(options, keys)
		// check tranlate function against expected value
		// highlight red if it is not what's expected
		return keys.map( (key) => (
			<ListGroupItem key={ key } header={ t( key, options[key] ) }>
			  { `key: ${key} options: ${ options[key] ? JSON.stringify(options[key]) : '' }` }
			</ListGroupItem>
		))
	}

	buildPanel(keys, options, header) {
		return (
			<Panel style={{ margin: '50px' }} header={ header }>
	      <ListGroup fill>
					{this.buildList(keys, options)}
				</ListGroup>
			</Panel>
		)
  }

  render() {
  	// const handleRedirect = path => browserHistory.push(`/${path}`);
  	const options = {
  		"interpolation.key": { what: 'i18next', how: 'great' },
  		"interpolation.keyDeep": { author: { what: 'happy' } },
  		"interpolation.keyDifferent": {myVar: 'flexibility', interpolation: {prefix: '__', suffix: '__'}},
  		"nesting.girlsAndBoys": {count: 2, "girls": 3},
  		"nesting.key2": { val: '$t(nesting.key1)' }
  	}
  	const basic = [ 'basic.key', 'basic.keyDeep.inner' ];
  	const interpolation = [ 'key', 'keyEscaped', 'keyUnescaped', 'keyDeep', 'keyDifferent' ].map(k => `interpolation.${k}`);
  	const nesting = [ 'girlsAndBoys', 'key2' ].map(k => `nesting.${k}`);

    return (
      <div style={{ marginTop: '80px' }}>
	      	{this.buildPanel(basic, options, 'Basic' )}
	      	{this.buildPanel(interpolation, options, 'Interpolation')}
	      	{this.buildPanel(nesting, options, 'Nesting')}
      </div>
    );
  }
}

export default translate(['common'])(Keys, { withRef: true });