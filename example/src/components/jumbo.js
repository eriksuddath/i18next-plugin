import React, { Component } from 'react';
import { Jumbotron, Button } from 'react-bootstrap';

// import i18next translate function, adds t to props
import { translate } from 'react-i18next';

// react-router
import { browserHistory } from 'react-router';

class Jumbo extends Component {
  render() {
    const { t } = this.props;
    const handleRedirect = path => browserHistory.push(`/${path}`);

    return (
      <Jumbotron style={{ margin: 'auto', marginTop: '70px', backgroundColor: 'white', maxWidth: '75%' }}>
          <h1>{ t('header') }</h1>
          <p>{ t('description') }</p>
          <p><Button 
            onClick={ () => handleRedirect('keys') }
            bsStyle="primary">View Keys</Button></p>
      </Jumbotron>
    );
  }
}

export default translate(['jumbo'])(Jumbo, { withRef: true });