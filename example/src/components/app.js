import React, { Component } from 'react';
import Nav from './nav';
import Jumbo from './jumbo';

import { i18n } from '../index'

class App extends Component {
  render() {
    return (
      <div>
      	<Nav />
      	{this.props.children}
      </div>
    );
  }
}

export default App;