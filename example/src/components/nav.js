import React, { Component } from 'react';
import { Navbar, Nav, NavItem, NavDropdown, MenuItem, Button } from 'react-bootstrap';

// react-router
import { Link, browserHistory } from 'react-router';

// import i18next, to toggle language
import { i18n } from '../index';

// link to Qordoba logo
const logo = 'http://seeklogo.com/images/Q/qordoba-logo-BC6F7BD304-seeklogo.com.png';

class Navigation extends Component {
  render() {
  	const toggle = lng => i18n.changeLanguage(lng);
  	const handleRedirect = path => browserHistory.push(`/${path}`);

    return (
    	  <Navbar fluid={true} fixedTop={true} style={{ height: '70px'}}>
    	    <Navbar.Header>
    	      <Navbar.Brand>
    	        <a 
    	        	handleRedirect={() => handleRedirect('/')}>
    	        	<img src={logo}
    	        		style={{ maxHeight: '40px', paddingRight: '15px' }}/></a>
    	        <Link
    	        	to="/"
    	        	style={{ color: 'black' }}>
    	        	Qordoba
    	        	</Link>
    	      </Navbar.Brand>
    	    </Navbar.Header>
    	    <Nav style={{ marginTop: '10px' }}>
    	      <NavItem
    	      	onClick={() => handleRedirect('keys')}
    	      	eventKey={1}>Keys</NavItem>
    	      <NavItem eventKey={2} href="#">Link</NavItem>
    	    </Nav>
    	    <Nav style={{ marginTop: '10px' }} pullRight>
  		      <NavDropdown style={{ float: 'right', paddingRight: '10px' }} eventKey={3} title="Select Language" id="basic-nav-dropdown">
  	          <MenuItem onClick={() => toggle('en')} eventKey={3.1}>English</MenuItem>
  	          <MenuItem onClick={() => toggle('es')} eventKey={3.2}>Español</MenuItem>
  	          <MenuItem onClick={() => toggle('da')} eventKey={3.3}>Dansk</MenuItem>
  		      </NavDropdown>
    	    </Nav>
    	  </Navbar>
    );
  }
}

export default Navigation;